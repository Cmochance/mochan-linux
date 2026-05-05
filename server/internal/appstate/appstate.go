// Package appstate stores small per-app JSON documents under DataDir.
//
// It is intended for app state that should follow the mochan-linux user across
// browsers, but does not yet deserve an app-specific backend package.
package appstate

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
)

const maxDocumentBytes = 2 << 20

var appIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

// Document is the persisted JSON envelope returned by the API.
type Document struct {
	AppID     string          `json:"app_id"`
	UpdatedAt time.Time       `json:"updated_at"`
	Data      json.RawMessage `json:"data"`
}

// Summary is returned by the list endpoint without the document body.
type Summary struct {
	AppID     string    `json:"app_id"`
	UpdatedAt time.Time `json:"updated_at"`
	Size      int64     `json:"size"`
}

// Store persists app JSON documents as <base>/<app-id>/state.json.
type Store struct {
	base string
	mu   sync.RWMutex
}

func NewStore(base string) (*Store, error) {
	if err := os.MkdirAll(base, 0o750); err != nil {
		return nil, err
	}
	return &Store{base: base}, nil
}

func (s *Store) List() ([]Summary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.base)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []Summary{}, nil
		}
		return nil, err
	}
	out := make([]Summary, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() || !validAppID(e.Name()) {
			continue
		}
		p := s.pathFor(e.Name())
		info, err := os.Stat(p)
		if err != nil {
			continue
		}
		out = append(out, Summary{
			AppID:     e.Name(),
			UpdatedAt: info.ModTime().UTC(),
			Size:      info.Size(),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AppID < out[j].AppID })
	return out, nil
}

func (s *Store) Get(appID string) (Document, error) {
	if !validAppID(appID) {
		return Document{}, ErrInvalidAppID
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	p := s.pathFor(appID)
	buf, err := os.ReadFile(p)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, fs.ErrNotExist
		}
		return Document{}, err
	}
	var doc Document
	if err := json.Unmarshal(buf, &doc); err != nil {
		return Document{}, err
	}
	if doc.AppID != appID {
		return Document{}, fmt.Errorf("state app id mismatch: %q", doc.AppID)
	}
	return doc, nil
}

func (s *Store) Put(appID string, data json.RawMessage) (Document, error) {
	if !validAppID(appID) {
		return Document{}, ErrInvalidAppID
	}
	data, err := normalizeData(data)
	if err != nil {
		return Document{}, err
	}
	doc := Document{
		AppID:     appID,
		UpdatedAt: time.Now().UTC(),
		Data:      data,
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.pathFor(appID)), 0o750); err != nil {
		return Document{}, err
	}
	if err := s.persistLocked(doc); err != nil {
		return Document{}, err
	}
	return doc, nil
}

func (s *Store) Patch(appID string, patch map[string]json.RawMessage) (Document, error) {
	if !validAppID(appID) {
		return Document{}, ErrInvalidAppID
	}
	if patch == nil {
		patch = map[string]json.RawMessage{}
	}
	for _, v := range patch {
		if _, err := normalizeData(v); err != nil {
			return Document{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	current := map[string]json.RawMessage{}
	if buf, err := os.ReadFile(s.pathFor(appID)); err == nil {
		var doc Document
		if err := json.Unmarshal(buf, &doc); err != nil {
			return Document{}, err
		}
		if doc.AppID != appID {
			return Document{}, fmt.Errorf("state app id mismatch: %q", doc.AppID)
		}
		if len(doc.Data) > 0 && string(doc.Data) != "null" {
			if err := json.Unmarshal(doc.Data, &current); err != nil {
				return Document{}, errors.New("existing app state is not a JSON object")
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return Document{}, err
	}

	for k, v := range patch {
		if string(v) == "null" {
			delete(current, k)
			continue
		}
		current[k] = append(json.RawMessage(nil), v...)
	}

	buf, err := json.Marshal(current)
	if err != nil {
		return Document{}, err
	}
	doc := Document{AppID: appID, UpdatedAt: time.Now().UTC(), Data: json.RawMessage(buf)}
	if err := os.MkdirAll(filepath.Dir(s.pathFor(appID)), 0o750); err != nil {
		return Document{}, err
	}
	if err := s.persistLocked(doc); err != nil {
		return Document{}, err
	}
	return doc, nil
}

func (s *Store) Delete(appID string) error {
	if !validAppID(appID) {
		return ErrInvalidAppID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	err := os.Remove(s.pathFor(appID))
	if errors.Is(err, os.ErrNotExist) {
		return fs.ErrNotExist
	}
	return err
}

func (s *Store) persistLocked(doc Document) error {
	buf, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	if len(buf) > maxDocumentBytes {
		return ErrDocumentTooLarge
	}
	p := s.pathFor(doc.AppID)
	tmp, err := os.CreateTemp(filepath.Dir(p), ".state-*.tmp")
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
	return os.Rename(tmpName, p)
}

func (s *Store) pathFor(appID string) string {
	return filepath.Join(s.base, appID, "state.json")
}

var (
	ErrInvalidAppID     = errors.New("invalid app id")
	ErrDocumentTooLarge = errors.New("app state document is too large")
)

func validAppID(appID string) bool {
	return appIDPattern.MatchString(appID)
}

func normalizeData(data json.RawMessage) (json.RawMessage, error) {
	if len(data) > maxDocumentBytes {
		return nil, ErrDocumentTooLarge
	}
	if len(data) == 0 {
		return json.RawMessage(`{}`), nil
	}
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, err
	}
	if v == nil {
		return json.RawMessage(`{}`), nil
	}
	out, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	if len(out) > maxDocumentBytes {
		return nil, ErrDocumentTooLarge
	}
	return json.RawMessage(out), nil
}

// Handler serves /api/app-state.
type Handler struct {
	store *Store
	audit *audit.Logger
}

func NewHandler(store *Store, auditLog *audit.Logger) *Handler {
	return &Handler{store: store, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/", h.list)
	r.Get("/{appID}", h.get)
	r.Put("/{appID}", h.put)
	r.Patch("/{appID}", h.patch)
	r.Delete("/{appID}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	list, err := h.store.List()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"apps": list})
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	doc, err := h.store.Get(chi.URLParam(r, "appID"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxDocumentBytes)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	doc, err := h.store.Put(chi.URLParam(r, "appID"), body.Data)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "appstate.put", doc.AppID, len(doc.Data))
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) patch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Patch map[string]json.RawMessage `json:"patch"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxDocumentBytes)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	doc, err := h.store.Patch(chi.URLParam(r, "appID"), body.Patch)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "appstate.patch", doc.AppID, len(doc.Data))
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appID")
	if err := h.store.Delete(appID); err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "appstate.delete", appID, 0)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) auditEvent(r *http.Request, eventType, appID string, bytes int) {
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
		Outcome: "ok",
		Detail: map[string]any{
			"app_id": appID,
			"bytes":  bytes,
		},
	})
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, ErrInvalidAppID):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, ErrDocumentTooLarge):
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
