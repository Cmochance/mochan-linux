package rss

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

func TestMain(m *testing.M) {
	restore := netguard.SetAllowPrivate(true)
	code := m.Run()
	restore()
	os.Exit(code)
}

func TestStoreAddFeedRefreshAndPersist(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/rss+xml")
		_, _ = w.Write([]byte(`<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Example RSS</title><link>https://example.com/</link>
<item><title>First</title><link>/first</link><guid>one</guid><description>Hello</description><pubDate>Mon, 01 Jan 2024 10:00:00 +0000</pubDate></item>
<item><title>Second</title><link>https://example.com/second</link><guid>two</guid><description>World</description></item>
</channel></rss>`))
	}))
	defer upstream.Close()

	base := t.TempDir()
	store, err := NewStore(base)
	if err != nil {
		t.Fatal(err)
	}
	feed, err := store.AddFeed(t.Context(), upstream.URL+"/feed.xml", "Tech")
	if err != nil {
		t.Fatal(err)
	}
	if feed.Title != "Example RSS" || feed.UnreadCount != 2 {
		t.Fatalf("feed = %+v", feed)
	}
	articles := store.ListArticles(feed.ID, false)
	if len(articles) != 2 {
		t.Fatalf("articles = %d, want 2", len(articles))
	}
	if articles[0].Title == "" || articles[0].Link == "" {
		t.Fatalf("article not normalized: %+v", articles[0])
	}

	reloaded, err := NewStore(base)
	if err != nil {
		t.Fatal(err)
	}
	feeds := reloaded.ListFeeds()
	if len(feeds) != 1 || feeds[0].UnreadCount != 2 {
		t.Fatalf("reloaded feeds = %+v", feeds)
	}
}

func TestParseAtomFeed(t *testing.T) {
	base, _ := parseFeedURL("https://example.com/feed")
	feed, articles, err := parseFeed([]byte(`<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Atom Example</title>
<link href="https://example.com/"/>
<entry>
<id>tag:example.com,2024:item</id>
<title>Atom Item</title>
<link href="/atom-item"/>
<summary>Atom summary</summary>
<updated>2024-01-02T12:00:00Z</updated>
<author><name>Alice</name></author>
</entry>
</feed>`), "feed1", base)
	if err != nil {
		t.Fatal(err)
	}
	if feed.Title != "Atom Example" || feed.SiteURL != "https://example.com/" {
		t.Fatalf("feed = %+v", feed)
	}
	if len(articles) != 1 || articles[0].Title != "Atom Item" || articles[0].Author != "Alice" {
		t.Fatalf("articles = %+v", articles)
	}
}

func TestRejectsUnsafeFeedURLs(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{
		"file:///tmp/feed.xml",
		"http://user:pass@example.com/feed",
		"http://169.254.169.254/latest/meta-data",
		"http://metadata.google.internal/computeMetadata/v1",
	} {
		if _, err := store.AddFeed(t.Context(), raw, ""); !errors.Is(err, ErrInvalidURL) {
			t.Fatalf("AddFeed(%q) error = %v, want ErrInvalidURL", raw, err)
		}
	}
}

func TestArticleStateMutations(t *testing.T) {
	store, feed := testStoreWithFeed(t)
	article := store.ListArticles(feed.ID, false)[0]

	updated, err := store.SetRead(article.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !updated.Read {
		t.Fatal("article was not marked read")
	}
	updated, err = store.SetStarred(article.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !updated.Starred {
		t.Fatal("article was not starred")
	}
	count, err := store.MarkAllRead(feed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("count = %d, want 0 because article was already read", count)
	}
	starred := store.ListArticles("", true)
	if len(starred) != 1 {
		t.Fatalf("starred articles = %d", len(starred))
	}
}

func TestHandlerRoutesAndAudit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<rss version="2.0"><channel><title>Handler Feed</title><item><title>News</title><guid>n1</guid></item></channel></rss>`))
	}))
	defer upstream.Close()

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	auditLog, err := audit.New(t.TempDir() + "/audit.log")
	if err != nil {
		t.Fatal(err)
	}
	defer auditLog.Close()

	router := chi.NewRouter()
	NewHandler(store, auditLog).Mount(router)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/feeds", strings.NewReader(`{"url":`+quote(upstream.URL)+`}`)))
	if rec.Code != http.StatusCreated {
		t.Fatalf("add status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var feed Feed
	if err := json.NewDecoder(rec.Body).Decode(&feed); err != nil {
		t.Fatal(err)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/articles", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("articles status = %d", rec.Code)
	}

	article := store.ListArticles(feed.ID, false)[0]
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/articles/"+article.ID+"/read", strings.NewReader(`{"read":true}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("read status = %d, body = %s", rec.Code, rec.Body.String())
	}

	auditBytes, err := os.ReadFile(auditLog.Path())
	if err != nil {
		t.Fatal(err)
	}
	auditText := string(auditBytes)
	if !strings.Contains(auditText, `"type":"rss.feed.add"`) || !strings.Contains(auditText, `"type":"rss.article.read"`) {
		t.Fatalf("audit log missing rss events: %s", auditText)
	}
}

func testStoreWithFeed(t *testing.T) (*Store, Feed) {
	t.Helper()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<rss version="2.0"><channel><title>State Feed</title><item><title>Only Item</title><guid>state-1</guid></item></channel></rss>`))
	}))
	t.Cleanup(upstream.Close)

	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	feed, err := store.AddFeed(t.Context(), upstream.URL, "")
	if err != nil {
		t.Fatal(err)
	}
	return store, feed
}

func quote(s string) string {
	buf, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(buf)
}
