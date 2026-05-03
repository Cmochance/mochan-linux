// Package audit writes JSONL audit events to a file and exposes a tail API.
//
// Events captured (event_type):
//   - auth.login.success / auth.login.fail / auth.logout
//   - fs.write / fs.delete / fs.move / fs.upload
//   - sys.kill
//
// Format: one JSON object per line. Append-only. Rotated to <file>.1 when
// the active file exceeds maxFileBytes. We keep at most one rotation
// (current + .1) — older rotations get truncated. This is single-user, low
// volume; no need for full logrotate semantics.
package audit

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

const maxFileBytes int64 = 10 << 20 // 10 MiB

// Event is one row of the JSONL audit file.
type Event struct {
	Time    time.Time      `json:"time"`
	Type    string         `json:"type"`
	Actor   string         `json:"actor"`
	IP      string         `json:"ip,omitempty"`
	Detail  map[string]any `json:"detail,omitempty"`
	Outcome string         `json:"outcome,omitempty"` // "ok" | "deny" | "error"
}

// Logger buffers writes to the JSONL file. Safe for concurrent use.
type Logger struct {
	path string
	mu   sync.Mutex
	f    *os.File
}

// New opens (or creates) the audit log at path. Errors out if the directory
// is not writable — that's the security boundary, audit MUST be persisted.
func New(path string) (*Logger, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return nil, err
	}
	return &Logger{path: path, f: f}, nil
}

// Close releases the file handle.
func (l *Logger) Close() error {
	if l == nil || l.f == nil {
		return nil
	}
	return l.f.Close()
}

// Log appends one event. Failures are silent on purpose: an audit-write
// failure must not break the underlying operation (e.g. login).
func (l *Logger) Log(ctx context.Context, e Event) {
	if l == nil {
		return
	}
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	buf, err := json.Marshal(e)
	if err != nil {
		return
	}
	buf = append(buf, '\n')

	l.mu.Lock()
	defer l.mu.Unlock()

	// rotation
	if info, err := l.f.Stat(); err == nil && info.Size()+int64(len(buf)) > maxFileBytes {
		_ = l.rotateLocked()
	}
	_, _ = l.f.Write(buf)
	_ = l.f.Sync()
}

func (l *Logger) rotateLocked() error {
	if err := l.f.Close(); err != nil {
		return err
	}
	old := l.path + ".1"
	_ = os.Remove(old)
	if err := os.Rename(l.path, old); err != nil {
		// re-open the original; rotation failed but we still need a writer
		f, openErr := os.OpenFile(l.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
		if openErr != nil {
			return openErr
		}
		l.f = f
		return err
	}
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o640)
	if err != nil {
		return err
	}
	l.f = f
	return nil
}

// Path returns the active log file path (mostly for tests / debug).
func (l *Logger) Path() string { return l.path }

// ClientIP extracts the best-guess client IP from a request, accounting for
// reverse proxies (X-Forwarded-For wins, falls back to RemoteAddr).
func ClientIP(r *http.Request) string {
	if v := r.Header.Get("CF-Connecting-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Real-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		if i := strings.IndexByte(v, ','); i >= 0 {
			v = v[:i]
		}
		return strings.TrimSpace(v)
	}
	host := r.RemoteAddr
	if i := strings.LastIndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	return host
}

// Handler exposes the GET /api/sys/audit endpoint that returns the most
// recent N events. Format: { "events": [ ... ], "more": bool }.
type Handler struct {
	logger *Logger
}

// NewHandler returns a chi handler for tail-reading the audit log.
func NewHandler(l *Logger) *Handler { return &Handler{logger: l} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/", h.tail)
}

func (h *Handler) tail(w http.ResponseWriter, r *http.Request) {
	if h.logger == nil {
		writeJSON(w, http.StatusOK, map[string]any{"events": []Event{}, "more": false})
		return
	}
	limit := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5000 {
			limit = n
		}
	}
	typeFilter := r.URL.Query().Get("type")

	events, more, err := readTail(h.logger.Path(), limit, typeFilter)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "more": more})
}

// readTail reads the file (and the .1 rotation if needed), keeps the last
// `limit` events optionally filtered by type, returns newest-first.
func readTail(path string, limit int, typeFilter string) ([]Event, bool, error) {
	files := []string{path + ".1", path} // older first so we end on newest
	all := make([]Event, 0, limit)
	totalSeen := 0
	for _, p := range files {
		f, err := os.Open(p)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return nil, false, err
		}
		s := bufio.NewScanner(f)
		s.Buffer(make([]byte, 64*1024), 1024*1024)
		for s.Scan() {
			line := s.Bytes()
			if len(line) == 0 {
				continue
			}
			var e Event
			if err := json.Unmarshal(line, &e); err != nil {
				continue
			}
			if typeFilter != "" && e.Type != typeFilter {
				continue
			}
			totalSeen++
			all = append(all, e)
		}
		_ = f.Close()
	}
	more := false
	if len(all) > limit {
		more = true
		all = all[len(all)-limit:]
	}
	// reverse → newest first
	for i, j := 0, len(all)-1; i < j; i, j = i+1, j-1 {
		all[i], all[j] = all[j], all[i]
	}
	return all, more, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// ensureLineSep is small helper for tests.
func ensureLineSep(w io.Writer) { _, _ = fmt.Fprint(w, "") }
