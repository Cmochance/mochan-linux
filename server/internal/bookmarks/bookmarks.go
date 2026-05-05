// Package bookmarks persists Browser and Bookmarks app data.
package bookmarks

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
)

const maxJSONBytes = 2 << 20

var (
	ErrNotFound   = errors.New("bookmark item not found")
	ErrBadRequest = errors.New("bad bookmark request")
)

type Folder struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parent_id,omitempty"`
}

type Bookmark struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Description string    `json:"description,omitempty"`
	FolderID    string    `json:"folder_id"`
	Favicon     string    `json:"favicon,omitempty"`
	VisitCount  int       `json:"visit_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type State struct {
	Folders   []Folder   `json:"folders"`
	Bookmarks []Bookmark `json:"bookmarks"`
}

type Store struct {
	path string
	mu   sync.Mutex
	data State
}

func NewStore(path string) (*Store, error) {
	s := &Store{path: filepath.Join(path, "index.json")}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o750); err != nil {
		return nil, err
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Snapshot() State {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := State{
		Folders:   append([]Folder{}, s.data.Folders...),
		Bookmarks: append([]Bookmark{}, s.data.Bookmarks...),
	}
	return out
}

func (s *Store) AddBookmark(in Bookmark) (Bookmark, error) {
	u, err := cleanURL(in.URL)
	if err != nil {
		return Bookmark{}, err
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = u.Host
	}
	now := time.Now().UTC()
	b := Bookmark{
		ID:          randomID(),
		Title:       title,
		URL:         u.String(),
		Description: strings.TrimSpace(in.Description),
		FolderID:    s.folderOrDefault(in.FolderID),
		Favicon:     strings.TrimSpace(in.Favicon),
		VisitCount:  0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if b.Favicon == "" {
		b.Favicon = "bookmark"
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Bookmarks = append([]Bookmark{b}, s.data.Bookmarks...)
	return b, s.saveLocked()
}

func (s *Store) UpdateBookmark(id string, in Bookmark) (Bookmark, error) {
	u, err := cleanURL(in.URL)
	if err != nil {
		return Bookmark{}, err
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = u.Host
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Bookmarks {
		if s.data.Bookmarks[i].ID == id {
			s.data.Bookmarks[i].Title = title
			s.data.Bookmarks[i].URL = u.String()
			s.data.Bookmarks[i].Description = strings.TrimSpace(in.Description)
			s.data.Bookmarks[i].FolderID = s.folderOrDefaultLocked(in.FolderID)
			s.data.Bookmarks[i].Favicon = strings.TrimSpace(in.Favicon)
			if s.data.Bookmarks[i].Favicon == "" {
				s.data.Bookmarks[i].Favicon = "bookmark"
			}
			s.data.Bookmarks[i].UpdatedAt = time.Now().UTC()
			return s.data.Bookmarks[i], s.saveLocked()
		}
	}
	return Bookmark{}, ErrNotFound
}

func (s *Store) DeleteBookmark(id string) (Bookmark, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, b := range s.data.Bookmarks {
		if b.ID == id {
			s.data.Bookmarks = append(s.data.Bookmarks[:i], s.data.Bookmarks[i+1:]...)
			return b, s.saveLocked()
		}
	}
	return Bookmark{}, ErrNotFound
}

func (s *Store) Visit(id string) (Bookmark, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.data.Bookmarks {
		if s.data.Bookmarks[i].ID == id {
			s.data.Bookmarks[i].VisitCount++
			s.data.Bookmarks[i].UpdatedAt = time.Now().UTC()
			return s.data.Bookmarks[i], s.saveLocked()
		}
	}
	return Bookmark{}, ErrNotFound
}

func (s *Store) AddFolder(name string) (Folder, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Folder{}, fmt.Errorf("%w: folder name is required", ErrBadRequest)
	}
	f := Folder{ID: "folder-" + randomID(), Name: name}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Folders = append(s.data.Folders, f)
	return f, s.saveLocked()
}

func (s *Store) DeleteFolder(id string) (Folder, error) {
	if id == "all" || id == "favorites" {
		return Folder{}, fmt.Errorf("%w: built-in folder cannot be deleted", ErrBadRequest)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, f := range s.data.Folders {
		if f.ID == id {
			s.data.Folders = append(s.data.Folders[:i], s.data.Folders[i+1:]...)
			for j := range s.data.Bookmarks {
				if s.data.Bookmarks[j].FolderID == id {
					s.data.Bookmarks[j].FolderID = "favorites"
				}
			}
			return f, s.saveLocked()
		}
	}
	return Folder{}, ErrNotFound
}

func (s *Store) Import(state State) (State, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	foldersByID := map[string]bool{}
	for _, f := range s.data.Folders {
		foldersByID[f.ID] = true
	}
	for _, f := range state.Folders {
		f.ID = strings.TrimSpace(f.ID)
		f.Name = strings.TrimSpace(f.Name)
		if f.ID == "" || f.Name == "" || foldersByID[f.ID] {
			continue
		}
		s.data.Folders = append(s.data.Folders, f)
		foldersByID[f.ID] = true
	}
	for _, b := range state.Bookmarks {
		u, err := cleanURL(b.URL)
		if err != nil {
			continue
		}
		b.ID = randomID()
		b.URL = u.String()
		if strings.TrimSpace(b.Title) == "" {
			b.Title = u.Host
		}
		if strings.TrimSpace(b.Favicon) == "" {
			b.Favicon = "bookmark"
		}
		b.FolderID = s.folderOrDefaultLocked(b.FolderID)
		b.CreatedAt = time.Now().UTC()
		b.UpdatedAt = b.CreatedAt
		s.data.Bookmarks = append(s.data.Bookmarks, b)
	}
	return s.data, s.saveLocked()
}

func (s *Store) load() error {
	f, err := os.Open(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.data = defaultState()
			return nil
		}
		return err
	}
	defer f.Close()
	var data State
	if err := json.NewDecoder(io.LimitReader(f, maxJSONBytes)).Decode(&data); err != nil {
		return err
	}
	if len(data.Folders) == 0 {
		data.Folders = defaultFolders()
	}
	s.data = data
	return nil
}

func (s *Store) saveLocked() error {
	tmp := s.path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(s.data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, s.path)
}

func (s *Store) folderOrDefault(id string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.folderOrDefaultLocked(id)
}

func (s *Store) folderOrDefaultLocked(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || id == "all" {
		return "favorites"
	}
	for _, f := range s.data.Folders {
		if f.ID == id {
			return id
		}
	}
	return "favorites"
}

type Handler struct {
	store *Store
	audit *audit.Logger
}

func NewHandler(store *Store, auditLog *audit.Logger) *Handler {
	return &Handler{store: store, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/", h.list)
	r.Post("/bookmarks", h.addBookmark)
	r.Put("/bookmarks/{id}", h.updateBookmark)
	r.Delete("/bookmarks/{id}", h.deleteBookmark)
	r.Post("/bookmarks/{id}/visit", h.visitBookmark)
	r.Post("/folders", h.addFolder)
	r.Delete("/folders/{id}", h.deleteFolder)
	r.Post("/import", h.importData)
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, h.store.Snapshot())
}

func (h *Handler) addBookmark(w http.ResponseWriter, r *http.Request) {
	var body Bookmark
	if !decodeJSON(w, r, &body) {
		return
	}
	bookmark, err := h.store.AddBookmark(body)
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.bookmark.add", "ok", map[string]any{"id": bookmark.ID, "host": hostFor(bookmark.URL)})
	writeJSON(w, http.StatusCreated, bookmark)
}

func (h *Handler) updateBookmark(w http.ResponseWriter, r *http.Request) {
	var body Bookmark
	if !decodeJSON(w, r, &body) {
		return
	}
	bookmark, err := h.store.UpdateBookmark(chi.URLParam(r, "id"), body)
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.bookmark.update", "ok", map[string]any{"id": bookmark.ID, "host": hostFor(bookmark.URL)})
	writeJSON(w, http.StatusOK, bookmark)
}

func (h *Handler) deleteBookmark(w http.ResponseWriter, r *http.Request) {
	bookmark, err := h.store.DeleteBookmark(chi.URLParam(r, "id"))
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.bookmark.delete", "ok", map[string]any{"id": bookmark.ID, "host": hostFor(bookmark.URL)})
	writeJSON(w, http.StatusOK, bookmark)
}

func (h *Handler) visitBookmark(w http.ResponseWriter, r *http.Request) {
	bookmark, err := h.store.Visit(chi.URLParam(r, "id"))
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, bookmark)
}

func (h *Handler) addFolder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	folder, err := h.store.AddFolder(body.Name)
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.folder.add", "ok", map[string]any{"id": folder.ID})
	writeJSON(w, http.StatusCreated, folder)
}

func (h *Handler) deleteFolder(w http.ResponseWriter, r *http.Request) {
	folder, err := h.store.DeleteFolder(chi.URLParam(r, "id"))
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.folder.delete", "ok", map[string]any{"id": folder.ID})
	writeJSON(w, http.StatusOK, folder)
}

func (h *Handler) importData(w http.ResponseWriter, r *http.Request) {
	var body State
	if !decodeJSON(w, r, &body) {
		return
	}
	state, err := h.store.Import(body)
	if err != nil {
		writeBookmarkError(w, err)
		return
	}
	h.auditEvent(r, "bookmarks.import", "ok", map[string]any{"bookmarks": len(body.Bookmarks), "folders": len(body.Folders)})
	writeJSON(w, http.StatusOK, state)
}

func defaultState() State {
	now := time.Now().UTC()
	return State{
		Folders: defaultFolders(),
		Bookmarks: []Bookmark{
			{ID: randomID(), Title: "Search", URL: "https://search.ink", FolderID: "favorites", Favicon: "search", CreatedAt: now, UpdatedAt: now},
			{ID: randomID(), Title: "News", URL: "https://news.ink", FolderID: "news", Favicon: "news", CreatedAt: now, UpdatedAt: now},
			{ID: randomID(), Title: "Wiki", URL: "https://wiki.ink", FolderID: "favorites", Favicon: "wiki", CreatedAt: now, UpdatedAt: now},
			{ID: randomID(), Title: "Music", URL: "https://music.ink", FolderID: "media", Favicon: "music", CreatedAt: now, UpdatedAt: now},
			{ID: randomID(), Title: "Art Gallery", URL: "https://art.ink", FolderID: "art", Favicon: "art", CreatedAt: now, UpdatedAt: now},
		},
	}
}

func defaultFolders() []Folder {
	return []Folder{
		{ID: "all", Name: "All"},
		{ID: "favorites", Name: "Favorites"},
		{ID: "reading", Name: "Reading List"},
		{ID: "tech", Name: "Tech"},
		{ID: "art", Name: "Art"},
		{ID: "news", Name: "News"},
		{ID: "tools", Name: "Tools"},
		{ID: "media", Name: "Media"},
		{ID: "shopping", Name: "Shopping"},
	}
}

func cleanURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("%w: url is required", ErrBadRequest)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid url", ErrBadRequest)
	}
	if u.Scheme != "http" && u.Scheme != "https" && u.Scheme != "ink" {
		return nil, fmt.Errorf("%w: unsupported url scheme", ErrBadRequest)
	}
	if u.Scheme != "ink" && u.Host == "" {
		return nil, fmt.Errorf("%w: url host is required", ErrBadRequest)
	}
	u.User = nil
	u.Fragment = ""
	return u, nil
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(io.LimitReader(r.Body, maxJSONBytes)).Decode(v); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return false
	}
	return true
}

func writeBookmarkError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
	} else if errors.Is(err, ErrBadRequest) {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func randomID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf[:])
}

func hostFor(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

func (h *Handler) auditEvent(r *http.Request, eventType, outcome string, detail map[string]any) {
	if h.audit == nil {
		return
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   "authenticated",
		IP:      audit.ClientIP(r),
		Outcome: outcome,
		Detail:  detail,
	})
}
