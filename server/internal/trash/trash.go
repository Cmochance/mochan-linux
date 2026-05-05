// Package trash implements a server-side recycle bin for files removed from
// the File Manager.
package trash

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
)

type Item struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	OriginalPath string    `json:"original_path"`
	IsDir        bool      `json:"is_dir"`
	Size         int64     `json:"size"`
	Mode         string    `json:"mode"`
	DeletedAt    time.Time `json:"deleted_at"`
}

type Store struct {
	base      string
	itemsDir  string
	indexPath string
	items     map[string]Item
	mu        sync.Mutex
}

type indexFile struct {
	Version int    `json:"version"`
	Items   []Item `json:"items"`
}

var (
	ErrInvalidID         = errors.New("invalid trash id")
	ErrDestinationExists = errors.New("restore destination already exists")
	ErrProtectedPath     = errors.New("cannot move trash storage into trash")
	ErrUnsupportedFile   = errors.New("unsupported file type for cross-device trash move")
)

func NewStore(base string) (*Store, error) {
	absBase, err := filepath.Abs(base)
	if err != nil {
		return nil, err
	}
	s := &Store{
		base:      absBase,
		itemsDir:  filepath.Join(absBase, "items"),
		indexPath: filepath.Join(absBase, "index.json"),
		items:     map[string]Item{},
	}
	if err := os.MkdirAll(s.itemsDir, 0o750); err != nil {
		return nil, err
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) List() []Item {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Item, 0, len(s.items))
	for _, item := range s.items {
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].DeletedAt.Equal(out[j].DeletedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].DeletedAt.After(out[j].DeletedAt)
	})
	return out
}

func (s *Store) Move(path string) (Item, error) {
	abs, err := cleanPath(path)
	if err != nil {
		return Item{}, err
	}
	if s.isProtectedPath(abs) {
		return Item{}, ErrProtectedPath
	}
	info, err := os.Lstat(abs)
	if err != nil {
		return Item{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	id, err := newID()
	if err != nil {
		return Item{}, err
	}
	for {
		if _, ok := s.items[id]; !ok {
			if _, err := os.Lstat(s.payloadPath(id)); errors.Is(err, os.ErrNotExist) {
				break
			} else if err != nil {
				return Item{}, err
			}
		}
		id, err = newID()
		if err != nil {
			return Item{}, err
		}
	}
	item := Item{
		ID:           id,
		Name:         info.Name(),
		OriginalPath: abs,
		IsDir:        info.IsDir(),
		Size:         info.Size(),
		Mode:         info.Mode().String(),
		DeletedAt:    time.Now().UTC(),
	}
	payload := s.payloadPath(id)
	if err := movePath(abs, payload, info); err != nil {
		return Item{}, err
	}
	s.items[id] = item
	if err := s.persistLocked(); err != nil {
		delete(s.items, id)
		_ = movePath(payload, abs, info)
		return Item{}, err
	}
	return item, nil
}

func (s *Store) Restore(id string) (Item, error) {
	if !validID(id) {
		return Item{}, ErrInvalidID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok {
		return Item{}, fs.ErrNotExist
	}
	if _, err := os.Lstat(item.OriginalPath); err == nil {
		return Item{}, ErrDestinationExists
	} else if !errors.Is(err, os.ErrNotExist) {
		return Item{}, err
	}
	if err := os.MkdirAll(filepath.Dir(item.OriginalPath), 0o755); err != nil {
		return Item{}, err
	}
	info, err := os.Lstat(s.payloadPath(id))
	if err != nil {
		return Item{}, err
	}
	if err := movePath(s.payloadPath(id), item.OriginalPath, info); err != nil {
		return Item{}, err
	}
	delete(s.items, id)
	if err := s.persistLocked(); err != nil {
		s.items[id] = item
		_ = movePath(item.OriginalPath, s.payloadPath(id), info)
		return Item{}, err
	}
	return item, nil
}

func (s *Store) Delete(ids []string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	unique := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	for _, id := range ids {
		if !validID(id) {
			return 0, ErrInvalidID
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if _, ok := s.items[id]; !ok {
			return 0, fs.ErrNotExist
		}
		unique = append(unique, id)
	}

	deleted := 0
	for _, id := range unique {
		if err := os.RemoveAll(s.payloadPath(id)); err != nil {
			return deleted, err
		}
		delete(s.items, id)
		deleted++
	}
	if deleted == 0 {
		return 0, nil
	}
	if err := s.persistLocked(); err != nil {
		return deleted, err
	}
	return deleted, nil
}

func (s *Store) Empty() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	deleted := 0
	for id := range s.items {
		if err := os.RemoveAll(s.payloadPath(id)); err != nil {
			return deleted, err
		}
		delete(s.items, id)
		deleted++
	}
	if err := s.persistLocked(); err != nil {
		return deleted, err
	}
	return deleted, nil
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
	for _, item := range idx.Items {
		if validID(item.ID) {
			s.items[item.ID] = item
		}
	}
	return nil
}

func (s *Store) persistLocked() error {
	items := make([]Item, 0, len(s.items))
	for _, item := range s.items {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	buf, err := json.MarshalIndent(indexFile{Version: 1, Items: items}, "", "  ")
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

func (s *Store) payloadPath(id string) string {
	return filepath.Join(s.itemsDir, id)
}

func (s *Store) isProtectedPath(path string) bool {
	rel, err := filepath.Rel(s.base, path)
	return err == nil && (rel == "." || !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) && rel != "..")
}

type Handler struct {
	store *Store
	audit *audit.Logger
}

func NewHandler(store *Store, auditLog *audit.Logger) *Handler {
	return &Handler{store: store, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/list", h.list)
	r.Post("/move", h.move)
	r.Post("/restore", h.restore)
	r.Post("/delete", h.delete)
	r.Post("/empty", h.empty)
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": h.store.List()})
}

func (h *Handler) move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	item, err := h.store.Move(body.Path)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "trash.move", map[string]any{
		"id":            item.ID,
		"original_path": item.OriginalPath,
		"is_dir":        item.IsDir,
		"size":          item.Size,
	})
	writeJSON(w, http.StatusOK, item)
}

func (h *Handler) restore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	item, err := h.store.Restore(body.ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "trash.restore", map[string]any{
		"id":            item.ID,
		"original_path": item.OriginalPath,
	})
	writeJSON(w, http.StatusOK, item)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID  string   `json:"id"`
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	ids := body.IDs
	if body.ID != "" {
		ids = append(ids, body.ID)
	}
	deleted, err := h.store.Delete(ids)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "trash.delete", map[string]any{
		"ids":     ids,
		"deleted": deleted,
	})
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}

func (h *Handler) empty(w http.ResponseWriter, r *http.Request) {
	deleted, err := h.store.Empty()
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "trash.empty", map[string]any{"deleted": deleted})
	writeJSON(w, http.StatusOK, map[string]any{"deleted": deleted})
}

func (h *Handler) auditEvent(r *http.Request, eventType string, detail map[string]any) {
	if h.audit == nil {
		return
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
		Outcome: "ok",
	})
}

func cleanPath(p string) (string, error) {
	if p == "" {
		return "", errors.New("path required")
	}
	if !filepath.IsAbs(p) {
		return "", errors.New("path must be absolute")
	}
	return filepath.Clean(p), nil
}

func movePath(from, to string, info fs.FileInfo) error {
	if err := os.Rename(from, to); err == nil {
		return nil
	} else if !errors.Is(err, syscall.EXDEV) {
		return err
	}
	if err := copyPath(from, to, info); err != nil {
		_ = os.RemoveAll(to)
		return err
	}
	var removeErr error
	if info.IsDir() {
		removeErr = os.RemoveAll(from)
	} else {
		removeErr = os.Remove(from)
	}
	if removeErr != nil {
		_ = os.RemoveAll(to)
		return removeErr
	}
	return nil
}

func copyPath(from, to string, info fs.FileInfo) error {
	mode := info.Mode()
	switch {
	case mode&os.ModeSymlink != 0:
		target, err := os.Readlink(from)
		if err != nil {
			return err
		}
		return os.Symlink(target, to)
	case info.IsDir():
		if err := os.Mkdir(to, mode.Perm()); err != nil {
			return err
		}
		entries, err := os.ReadDir(from)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			src := filepath.Join(from, entry.Name())
			dst := filepath.Join(to, entry.Name())
			childInfo, err := os.Lstat(src)
			if err != nil {
				return err
			}
			if err := copyPath(src, dst, childInfo); err != nil {
				return err
			}
		}
		return os.Chmod(to, mode.Perm())
	case mode.IsRegular():
		src, err := os.Open(from)
		if err != nil {
			return err
		}
		defer src.Close()
		dst, err := os.OpenFile(to, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode.Perm())
		if err != nil {
			return err
		}
		if _, err := io.Copy(dst, src); err != nil {
			_ = dst.Close()
			return err
		}
		if err := dst.Close(); err != nil {
			return err
		}
		return os.Chmod(to, mode.Perm())
	default:
		return fmt.Errorf("%w: %s", ErrUnsupportedFile, mode.String())
	}
}

func newID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func validID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, fs.ErrPermission):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, ErrDestinationExists):
		http.Error(w, err.Error(), http.StatusConflict)
	case errors.Is(err, ErrInvalidID), errors.Is(err, ErrProtectedPath), errors.Is(err, ErrUnsupportedFile):
		http.Error(w, err.Error(), http.StatusBadRequest)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
