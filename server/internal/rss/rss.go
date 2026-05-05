// Package rss stores feed subscriptions, refreshes RSS/Atom feeds, and caches
// article state for the RSS Reader app.
package rss

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

const (
	maxFeedBytes       = 5 << 20
	maxArticlesPerFeed = 200
)

type Feed struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	URL           string     `json:"url"`
	SiteURL       string     `json:"site_url,omitempty"`
	Category      string     `json:"category"`
	UnreadCount   int        `json:"unread_count"`
	LastRefreshAt *time.Time `json:"last_refresh_at,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type Article struct {
	ID          string     `json:"id"`
	FeedID      string     `json:"feed_id"`
	Title       string     `json:"title"`
	Link        string     `json:"link,omitempty"`
	Summary     string     `json:"summary,omitempty"`
	Content     string     `json:"content,omitempty"`
	Author      string     `json:"author,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	Read        bool       `json:"read"`
	Starred     bool       `json:"starred"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type Store struct {
	base      string
	indexPath string
	client    *http.Client

	mu       sync.RWMutex
	feeds    map[string]*Feed
	articles map[string]*Article
}

type indexFile struct {
	Version  int       `json:"version"`
	Feeds    []Feed    `json:"feeds"`
	Articles []Article `json:"articles"`
}

var (
	ErrNotFound   = errors.New("rss item not found")
	ErrInvalidURL = errors.New("invalid feed url")
	ErrBadRequest = errors.New("bad rss request")
)

func NewStore(base string) (*Store, error) {
	abs, err := filepath.Abs(base)
	if err != nil {
		return nil, err
	}
	s := &Store{
		base:      abs,
		indexPath: filepath.Join(abs, "index.json"),
		client:    netguard.NewHTTPClient(20*time.Second, 5),
		feeds:     map[string]*Feed{},
		articles:  map[string]*Article{},
	}
	if err := os.MkdirAll(abs, 0o750); err != nil {
		return nil, err
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) ListFeeds() []Feed {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.listFeedsLocked()
}

func (s *Store) ListArticles(feedID string, starred bool) []Article {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]Article, 0, len(s.articles))
	for _, article := range s.articles {
		if feedID != "" && article.FeedID != feedID {
			continue
		}
		if starred && !article.Starred {
			continue
		}
		out = append(out, cloneArticle(article))
	}
	sortArticles(out)
	return out
}

func (s *Store) AddFeed(ctx context.Context, rawURL, category string) (Feed, error) {
	target, err := parseFeedURL(rawURL)
	if err != nil {
		return Feed{}, err
	}
	id, err := newID()
	if err != nil {
		return Feed{}, err
	}
	now := time.Now().UTC()
	feed := &Feed{
		ID:        id,
		Title:     target.Hostname(),
		URL:       target.String(),
		Category:  cleanCategory(category),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if feed.Category == "" {
		feed.Category = "未分类"
	}

	s.mu.Lock()
	for {
		if _, exists := s.feeds[id]; !exists {
			break
		}
		id, err = newID()
		if err != nil {
			s.mu.Unlock()
			return Feed{}, err
		}
		feed.ID = id
	}
	for _, existing := range s.feeds {
		if existing.URL == feed.URL {
			out := cloneFeed(existing)
			s.mu.Unlock()
			return out, nil
		}
	}
	s.feeds[id] = feed
	if err := s.persistLocked(); err != nil {
		delete(s.feeds, id)
		s.mu.Unlock()
		return Feed{}, err
	}
	s.mu.Unlock()

	refreshed, err := s.RefreshFeed(ctx, id)
	if err != nil {
		return s.GetFeed(id)
	}
	return refreshed, nil
}

func (s *Store) GetFeed(id string) (Feed, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	feed, ok := s.feeds[id]
	if !ok {
		return Feed{}, ErrNotFound
	}
	return cloneFeed(feed), nil
}

func (s *Store) DeleteFeed(id string) (Feed, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	feed, ok := s.feeds[id]
	if !ok {
		return Feed{}, ErrNotFound
	}
	out := cloneFeed(feed)
	delete(s.feeds, id)
	for articleID, article := range s.articles {
		if article.FeedID == id {
			delete(s.articles, articleID)
		}
	}
	if err := s.persistLocked(); err != nil {
		s.feeds[id] = feed
		return Feed{}, err
	}
	return out, nil
}

func (s *Store) RefreshAll(ctx context.Context) ([]Feed, error) {
	feeds := s.ListFeeds()
	out := make([]Feed, 0, len(feeds))
	var firstErr error
	for _, feed := range feeds {
		refreshed, err := s.RefreshFeed(ctx, feed.ID)
		if err != nil && firstErr == nil {
			firstErr = err
		}
		if err == nil {
			out = append(out, refreshed)
		} else if current, getErr := s.GetFeed(feed.ID); getErr == nil {
			out = append(out, current)
		}
	}
	return out, firstErr
}

func (s *Store) RefreshFeed(ctx context.Context, id string) (Feed, error) {
	s.mu.RLock()
	feed, ok := s.feeds[id]
	if !ok {
		s.mu.RUnlock()
		return Feed{}, ErrNotFound
	}
	feedSnapshot := cloneFeed(feed)
	s.mu.RUnlock()

	parsed, articles, err := s.fetchAndParse(ctx, feedSnapshot.URL, feedSnapshot.ID)
	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()
	current, ok := s.feeds[id]
	if !ok {
		return Feed{}, ErrNotFound
	}
	if err != nil {
		current.LastError = err.Error()
		current.UpdatedAt = now
		_ = s.persistLocked()
		return cloneFeed(current), err
	}
	if parsed.Title != "" {
		current.Title = parsed.Title
	}
	if parsed.SiteURL != "" {
		current.SiteURL = parsed.SiteURL
	}
	current.LastRefreshAt = &now
	current.LastError = ""
	current.UpdatedAt = now

	for _, parsedArticle := range articles {
		existing, exists := s.articles[parsedArticle.ID]
		if exists {
			parsedArticle.Read = existing.Read
			parsedArticle.Starred = existing.Starred
			parsedArticle.CreatedAt = existing.CreatedAt
		}
		parsedArticle.UpdatedAt = now
		article := parsedArticle
		s.articles[article.ID] = &article
	}
	s.trimArticlesLocked(id)
	if err := s.persistLocked(); err != nil {
		return Feed{}, err
	}
	return s.feedWithUnreadLocked(current), nil
}

func (s *Store) SetRead(id string, read bool) (Article, error) {
	return s.updateArticle(id, func(article *Article) {
		article.Read = read
	})
}

func (s *Store) SetStarred(id string, starred bool) (Article, error) {
	return s.updateArticle(id, func(article *Article) {
		article.Starred = starred
	})
}

func (s *Store) MarkAllRead(feedID string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	now := time.Now().UTC()
	for _, article := range s.articles {
		if feedID != "" && article.FeedID != feedID {
			continue
		}
		if !article.Read {
			article.Read = true
			article.UpdatedAt = now
			count++
		}
	}
	if err := s.persistLocked(); err != nil {
		return 0, err
	}
	return count, nil
}

func (s *Store) updateArticle(id string, fn func(*Article)) (Article, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	article, ok := s.articles[id]
	if !ok {
		return Article{}, ErrNotFound
	}
	fn(article)
	article.UpdatedAt = time.Now().UTC()
	if err := s.persistLocked(); err != nil {
		return Article{}, err
	}
	return cloneArticle(article), nil
}

func (s *Store) fetchAndParse(ctx context.Context, rawURL, feedID string) (parsedFeed, []Article, error) {
	target, err := parseFeedURL(rawURL)
	if err != nil {
		return parsedFeed{}, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return parsedFeed{}, nil, err
	}
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5")
	req.Header.Set("User-Agent", "mochan-linux-rss/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return parsedFeed{}, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return parsedFeed{}, nil, fmt.Errorf("feed fetch failed with HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxFeedBytes+1))
	if err != nil {
		return parsedFeed{}, nil, err
	}
	if len(body) > maxFeedBytes {
		return parsedFeed{}, nil, fmt.Errorf("feed response too large: limit is %d bytes", maxFeedBytes)
	}
	return parseFeed(body, feedID, target)
}

func (s *Store) load() error {
	buf, err := os.ReadFile(s.indexPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	var idx indexFile
	if err := json.Unmarshal(buf, &idx); err != nil {
		return err
	}
	for _, feed := range idx.Feeds {
		f := feed
		s.feeds[f.ID] = &f
	}
	for _, article := range idx.Articles {
		a := article
		s.articles[a.ID] = &a
	}
	return nil
}

func (s *Store) persistLocked() error {
	feeds := make([]Feed, 0, len(s.feeds))
	for _, feed := range s.feeds {
		feeds = append(feeds, s.feedWithUnreadLocked(feed))
	}
	sort.Slice(feeds, func(i, j int) bool { return feeds[i].Title < feeds[j].Title })
	articles := make([]Article, 0, len(s.articles))
	for _, article := range s.articles {
		articles = append(articles, cloneArticle(article))
	}
	sortArticles(articles)
	buf, err := json.MarshalIndent(indexFile{Version: 1, Feeds: feeds, Articles: articles}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.base, ".index-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if _, err := tmp.Write(buf); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o640); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, s.indexPath)
}

func (s *Store) listFeedsLocked() []Feed {
	out := make([]Feed, 0, len(s.feeds))
	for _, feed := range s.feeds {
		out = append(out, s.feedWithUnreadLocked(feed))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Category == out[j].Category {
			return out[i].Title < out[j].Title
		}
		return out[i].Category < out[j].Category
	})
	return out
}

func (s *Store) feedWithUnreadLocked(feed *Feed) Feed {
	out := cloneFeed(feed)
	unread := 0
	for _, article := range s.articles {
		if article.FeedID == feed.ID && !article.Read {
			unread++
		}
	}
	out.UnreadCount = unread
	return out
}

func (s *Store) trimArticlesLocked(feedID string) {
	items := make([]Article, 0)
	for _, article := range s.articles {
		if article.FeedID == feedID {
			items = append(items, cloneArticle(article))
		}
	}
	sortArticles(items)
	for i := maxArticlesPerFeed; i < len(items); i++ {
		delete(s.articles, items[i].ID)
	}
}

type parsedFeed struct {
	Title   string
	SiteURL string
}

type genericFeed struct {
	Channel *rssChannel `xml:"channel"`
	Title   string      `xml:"title"`
	Links   []atomLink  `xml:"link"`
	Entries []atomEntry `xml:"entry"`
}

type rssChannel struct {
	Title string    `xml:"title"`
	Link  string    `xml:"link"`
	Items []rssItem `xml:"item"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	GUID        string `xml:"guid"`
	Description string `xml:"description"`
	Content     string `xml:"encoded"`
	PubDate     string `xml:"pubDate"`
	Author      string `xml:"author"`
	Creator     string `xml:"creator"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

type atomEntry struct {
	ID        string     `xml:"id"`
	Title     string     `xml:"title"`
	Summary   string     `xml:"summary"`
	Content   string     `xml:"content"`
	Updated   string     `xml:"updated"`
	Published string     `xml:"published"`
	Links     []atomLink `xml:"link"`
	Author    struct {
		Name string `xml:"name"`
	} `xml:"author"`
}

func parseFeed(body []byte, feedID string, base *url.URL) (parsedFeed, []Article, error) {
	body = bytes.TrimPrefix(body, []byte{0xef, 0xbb, 0xbf})
	var doc genericFeed
	if err := xml.Unmarshal(body, &doc); err != nil {
		return parsedFeed{}, nil, err
	}
	now := time.Now().UTC()
	if doc.Channel != nil {
		feed := parsedFeed{Title: cleanText(doc.Channel.Title), SiteURL: resolveLink(doc.Channel.Link, base)}
		articles := make([]Article, 0, len(doc.Channel.Items))
		for _, item := range doc.Channel.Items {
			title := cleanText(item.Title)
			link := resolveLink(cleanText(item.Link), base)
			summary := cleanText(item.Description)
			content := cleanText(item.Content)
			if content == "" {
				content = summary
			}
			published := parseTime(item.PubDate)
			sourceID := firstNonEmpty(cleanText(item.GUID), link, title)
			articleID := stableArticleID(feedID, sourceID, title, published)
			articles = append(articles, Article{
				ID:          articleID,
				FeedID:      feedID,
				Title:       firstNonEmpty(title, link, "(untitled)"),
				Link:        link,
				Summary:     summary,
				Content:     content,
				Author:      firstNonEmpty(cleanText(item.Creator), cleanText(item.Author)),
				PublishedAt: published,
				CreatedAt:   now,
				UpdatedAt:   now,
			})
		}
		return feed, articles, nil
	}
	if len(doc.Entries) > 0 {
		feed := parsedFeed{Title: cleanText(doc.Title), SiteURL: atomBestLink(doc.Links, base)}
		articles := make([]Article, 0, len(doc.Entries))
		for _, entry := range doc.Entries {
			title := cleanText(entry.Title)
			link := atomBestLink(entry.Links, base)
			summary := cleanText(entry.Summary)
			content := cleanText(entry.Content)
			if content == "" {
				content = summary
			}
			published := parseTime(firstNonEmpty(entry.Published, entry.Updated))
			sourceID := firstNonEmpty(cleanText(entry.ID), link, title)
			articleID := stableArticleID(feedID, sourceID, title, published)
			articles = append(articles, Article{
				ID:          articleID,
				FeedID:      feedID,
				Title:       firstNonEmpty(title, link, "(untitled)"),
				Link:        link,
				Summary:     summary,
				Content:     content,
				Author:      cleanText(entry.Author.Name),
				PublishedAt: published,
				CreatedAt:   now,
				UpdatedAt:   now,
			})
		}
		return feed, articles, nil
	}
	return parsedFeed{}, nil, errors.New("unsupported feed format")
}

func parseFeedURL(raw string) (*url.URL, error) {
	u, err := netguard.ParseHTTPURL(raw)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	return u, nil
}

func cleanText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	for strings.Contains(s, "\n\n\n") {
		s = strings.ReplaceAll(s, "\n\n\n", "\n\n")
	}
	return s
}

func cleanCategory(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}

func resolveLink(raw string, base *url.URL) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if base != nil {
		u = base.ResolveReference(u)
	}
	return u.String()
}

func atomBestLink(links []atomLink, base *url.URL) string {
	for _, link := range links {
		if link.Rel == "" || link.Rel == "alternate" {
			if resolved := resolveLink(link.Href, base); resolved != "" {
				return resolved
			}
		}
	}
	if len(links) > 0 {
		return resolveLink(links[0].Href, base)
	}
	return ""
}

func parseTime(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		time.RFC1123Z,
		time.RFC1123,
		"Mon, 02 Jan 2006 15:04:05 -0700",
		"Mon, 02 Jan 2006 15:04:05 MST",
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func stableArticleID(feedID, sourceID, title string, published *time.Time) string {
	seed := feedID + "\x00" + sourceID + "\x00" + title
	if published != nil {
		seed += "\x00" + published.Format(time.RFC3339Nano)
	}
	sum := sha256.Sum256([]byte(seed))
	return hex.EncodeToString(sum[:16])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func sortArticles(articles []Article) {
	sort.Slice(articles, func(i, j int) bool {
		left, right := articles[i].PublishedAt, articles[j].PublishedAt
		if left != nil && right != nil && !left.Equal(*right) {
			return left.After(*right)
		}
		if left != nil && right == nil {
			return true
		}
		if left == nil && right != nil {
			return false
		}
		if !articles[i].CreatedAt.Equal(articles[j].CreatedAt) {
			return articles[i].CreatedAt.After(articles[j].CreatedAt)
		}
		return articles[i].ID < articles[j].ID
	})
}

func newID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func cloneFeed(feed *Feed) Feed {
	if feed == nil {
		return Feed{}
	}
	out := *feed
	return out
}

func cloneArticle(article *Article) Article {
	if article == nil {
		return Article{}
	}
	out := *article
	return out
}

type Handler struct {
	store *Store
	audit *audit.Logger
}

func NewHandler(store *Store, auditLog *audit.Logger) *Handler {
	return &Handler{store: store, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/feeds", h.listFeeds)
	r.Post("/feeds", h.addFeed)
	r.Delete("/feeds/{id}", h.deleteFeed)
	r.Post("/feeds/{id}/refresh", h.refreshFeed)
	r.Post("/refresh", h.refreshAll)
	r.Get("/articles", h.listArticles)
	r.Post("/articles/{id}/read", h.setRead)
	r.Post("/articles/{id}/star", h.setStarred)
	r.Post("/articles/read-all", h.markAllRead)
}

func (h *Handler) listFeeds(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"feeds": h.store.ListFeeds()})
}

func (h *Handler) addFeed(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL      string `json:"url"`
		Category string `json:"category"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64*1024)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	feed, err := h.store.AddFeed(r.Context(), body.URL, body.Category)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "rss.feed.add", "ok", map[string]any{"id": feed.ID, "host": hostFor(feed.URL)})
	writeJSON(w, http.StatusCreated, feed)
}

func (h *Handler) deleteFeed(w http.ResponseWriter, r *http.Request) {
	feed, err := h.store.DeleteFeed(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "rss.feed.delete", "ok", map[string]any{"id": feed.ID, "host": hostFor(feed.URL)})
	writeJSON(w, http.StatusOK, feed)
}

func (h *Handler) refreshFeed(w http.ResponseWriter, r *http.Request) {
	feed, err := h.store.RefreshFeed(r.Context(), chi.URLParam(r, "id"))
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "rss.feed.refresh", outcome, map[string]any{"id": chi.URLParam(r, "id"), "error": errString(err)})
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, feed)
}

func (h *Handler) refreshAll(w http.ResponseWriter, r *http.Request) {
	feeds, err := h.store.RefreshAll(r.Context())
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "rss.refresh", outcome, map[string]any{"error": errString(err)})
	writeJSON(w, http.StatusOK, map[string]any{"feeds": feeds, "error": errString(err)})
}

func (h *Handler) listArticles(w http.ResponseWriter, r *http.Request) {
	feedID := r.URL.Query().Get("feed_id")
	starred := r.URL.Query().Get("starred") == "true"
	writeJSON(w, http.StatusOK, map[string]any{"articles": h.store.ListArticles(feedID, starred)})
}

func (h *Handler) setRead(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Read bool `json:"read"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	article, err := h.store.SetRead(chi.URLParam(r, "id"), body.Read)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "rss.article.read", "ok", map[string]any{"id": article.ID, "feed_id": article.FeedID, "read": article.Read})
	writeJSON(w, http.StatusOK, article)
}

func (h *Handler) setStarred(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Starred bool `json:"starred"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	article, err := h.store.SetStarred(chi.URLParam(r, "id"), body.Starred)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "rss.article.star", "ok", map[string]any{"id": article.ID, "feed_id": article.FeedID, "starred": article.Starred})
	writeJSON(w, http.StatusOK, article)
}

func (h *Handler) markAllRead(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FeedID string `json:"feed_id"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
	count, err := h.store.MarkAllRead(body.FeedID)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "rss.article.read_all", "ok", map[string]any{"feed_id": body.FeedID, "count": count})
	writeJSON(w, http.StatusOK, map[string]any{"updated": count})
}

func (h *Handler) auditEvent(r *http.Request, eventType, outcome string, detail map[string]any) {
	if h.audit == nil {
		return
	}
	for key, value := range detail {
		if value == "" || value == nil {
			delete(detail, key)
		}
	}
	actor := ""
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		actor = c.Subject
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   actor,
		IP:      audit.ClientIP(r),
		Detail:  detail,
		Outcome: outcome,
	})
}

func hostFor(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Host
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidURL), errors.Is(err, ErrBadRequest):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
