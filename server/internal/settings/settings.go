// Package settings exposes /api/settings for cross-device user preferences,
// and /api/settings/wallpapers for managing the wallpaper bucket on disk.
package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
)

// Settings is the cross-device user preference document persisted as JSON.
type Settings struct {
	Theme     string `json:"theme"`     // ink | dark | light
	Language  string `json:"language"`  // zh | en
	Wallpaper string `json:"wallpaper"` // wallpaper id (bundled name or user filename)
}

func defaults() Settings {
	return Settings{Theme: "ink", Language: "zh", Wallpaper: "wallpaper-default"}
}

// Store is the persistent settings document. Concurrent-safe.
type Store struct {
	path string
	mu   sync.RWMutex
	data Settings
}

// NewStore opens or creates the settings file. Path is e.g.
// /var/lib/mochan/settings.json.
func NewStore(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	s := &Store{path: path, data: defaults()}
	if buf, err := os.ReadFile(path); err == nil {
		var d Settings
		if json.Unmarshal(buf, &d) == nil {
			merged := defaults()
			if d.Theme != "" {
				merged.Theme = d.Theme
			}
			if d.Language != "" {
				merged.Language = d.Language
			}
			if d.Wallpaper != "" {
				merged.Wallpaper = d.Wallpaper
			}
			s.data = merged
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return s, nil
}

// Get returns a copy of the current settings.
func (s *Store) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data
}

// Patch merges a partial JSON object into the settings. Unknown keys are
// ignored. Returns the new state.
func (s *Store) Patch(patch map[string]any) (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if v, ok := patch["theme"].(string); ok && validTheme(v) {
		s.data.Theme = v
	}
	if v, ok := patch["language"].(string); ok && validLang(v) {
		s.data.Language = v
	}
	if v, ok := patch["wallpaper"].(string); ok && validWallpaperName(v) {
		s.data.Wallpaper = v
	}
	if err := s.persist(); err != nil {
		return s.data, err
	}
	return s.data, nil
}

func (s *Store) persist() error {
	tmp := s.path + ".tmp"
	buf, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, buf, 0o640); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func validTheme(s string) bool {
	return s == "ink" || s == "dark" || s == "light"
}

func validLang(s string) bool {
	return s == "zh" || s == "en"
}

// validWallpaperName guards against path traversal and weird names. We
// accept "wallpaper-..." style bundled IDs and any safe basename for
// user-uploaded files.
func validWallpaperName(s string) bool {
	if s == "" || len(s) > 200 {
		return false
	}
	if strings.ContainsAny(s, "/\\\x00") {
		return false
	}
	if s == "." || s == ".." {
		return false
	}
	return true
}

// ---------------------------------------------------------------------
// Wallpaper bucket
// ---------------------------------------------------------------------

// Bucket manages user-uploaded wallpaper files on disk under
// <DataDir>/wallpapers.
type Bucket struct {
	dir string
}

func NewBucket(dir string) (*Bucket, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	return &Bucket{dir: dir}, nil
}

// Wallpaper is the JSON shape returned to the frontend.
type Wallpaper struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Size   int64  `json:"size"`
	Source string `json:"source"` // "bundled" | "user"
}

// BundledWallpapers is the list of wallpaper IDs baked into the frontend
// bundle. The frontend resolves these to relative `./<id>.jpg` URLs.
var BundledWallpapers = []string{
	"wallpaper-default",
	"wallpaper-ink-splash",
	"wallpaper-bamboo",
	"wallpaper-lotus",
	"wallpaper-calligraphy",
}

func (b *Bucket) list() ([]Wallpaper, error) {
	entries, err := os.ReadDir(b.dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	out := make([]Wallpaper, 0, len(BundledWallpapers)+len(entries))
	for _, name := range BundledWallpapers {
		out = append(out, Wallpaper{
			Name:   name,
			URL:    "./" + name + ".jpg",
			Source: "bundled",
		})
	}
	for _, e := range entries {
		if e.IsDir() || !looksLikeImage(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Wallpaper{
			Name:   e.Name(),
			URL:    "/api/settings/wallpapers/" + e.Name(),
			Size:   info.Size(),
			Source: "user",
		})
	}
	return out, nil
}

func looksLikeImage(name string) bool {
	low := strings.ToLower(name)
	for _, ext := range []string{".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"} {
		if strings.HasSuffix(low, ext) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------

type Handler struct {
	store  *Store
	bucket *Bucket
}

func NewHandler(s *Store, b *Bucket) *Handler { return &Handler{store: s, bucket: b} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/", h.get)
	r.Patch("/", h.patch)
	r.Route("/wallpapers", func(wr chi.Router) {
		wr.Get("/", h.listWallpapers)
		wr.Post("/", h.uploadWallpaper)
		wr.Get("/{name}", h.serveWallpaper)
		wr.Delete("/{name}", h.deleteWallpaper)
	})
}

func (h *Handler) get(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, h.store.Get())
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	out, err := h.store.Patch(body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) listWallpapers(w http.ResponseWriter, _ *http.Request) {
	list, err := h.bucket.list()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"wallpapers": list})
}

func (h *Handler) uploadWallpaper(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		http.Error(w, "no file", http.StatusBadRequest)
		return
	}
	saved := make([]Wallpaper, 0, len(files))
	for _, fh := range files {
		base := filepath.Base(fh.Filename)
		if !validWallpaperName(base) || !looksLikeImage(base) {
			http.Error(w, "bad filename", http.StatusBadRequest)
			return
		}
		dest := filepath.Join(h.bucket.dir, base)
		src, err := fh.Open()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dst, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o640)
		if err != nil {
			src.Close()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			src.Close()
			dst.Close()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		src.Close()
		dst.Close()
		info, _ := os.Stat(dest)
		saved = append(saved, Wallpaper{
			Name:   base,
			URL:    "/api/settings/wallpapers/" + base,
			Size:   info.Size(),
			Source: "user",
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": saved})
}

func (h *Handler) serveWallpaper(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !validWallpaperName(name) || !looksLikeImage(name) {
		http.Error(w, "bad name", http.StatusBadRequest)
		return
	}
	full := filepath.Join(h.bucket.dir, name)
	if !strings.HasPrefix(full, h.bucket.dir) {
		http.Error(w, "bad name", http.StatusBadRequest)
		return
	}
	if _, err := os.Stat(full); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.ServeFile(w, r, full)
}

func (h *Handler) deleteWallpaper(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !validWallpaperName(name) {
		http.Error(w, "bad name", http.StatusBadRequest)
		return
	}
	full := filepath.Join(h.bucket.dir, name)
	if err := os.Remove(full); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// guard against unused import being inserted on save
var _ = fmt.Sprintf
