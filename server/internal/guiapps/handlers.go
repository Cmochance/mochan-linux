package guiapps

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
)

// Handler exposes the manager over HTTP.
type Handler struct {
	mgr   *Manager
	audit *audit.Logger
}

// NewHandler binds the manager and audit logger.
func NewHandler(m *Manager, al *audit.Logger) *Handler {
	return &Handler{mgr: m, audit: al}
}

// MountAdmin registers /api/gui/* routes that all require admin role.
// Launching arbitrary commands as root via xpra is admin-grade; we don't
// expose this to non-admin users.
func (h *Handler) MountAdmin(r chi.Router) {
	r.Get("/", h.list)
	r.Get("/apps", h.ListAppsHandler())
	r.Post("/launch", h.requireAdmin(h.launch))
	r.Post("/sessions/{id}/stop", h.requireAdmin(h.stop))
}

// MountProxy registers /xpra/{id}/* on a router OUTSIDE /api so the
// reverse-proxied content (xpra's HTML5 client + WS) flows directly
// through. The auth middleware is still applied at the parent router.
func (h *Handler) MountProxy(r chi.Router) {
	// chi's wildcard syntax mounts everything under the prefix.
	r.HandleFunc("/xpra/{id}/*", h.proxy)
	r.HandleFunc("/xpra/{id}", h.proxyRedirect)
}

func (h *Handler) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, ok := auth.ClaimsFrom(r.Context())
		if !ok || c.Role != "admin" {
			http.Error(w, "admin only", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"sessions": h.mgr.List()})
}

type launchReq struct {
	Command string `json:"command"`
}

func (h *Handler) launch(w http.ResponseWriter, r *http.Request) {
	var body launchReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	body.Command = strings.TrimSpace(body.Command)
	if body.Command == "" {
		http.Error(w, "command is required", http.StatusBadRequest)
		return
	}
	actor := ""
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		actor = c.Subject
	}
	sess, err := h.mgr.Launch(r.Context(), body.Command, actor)
	if err != nil {
		if errors.Is(err, ErrEmptyCommand) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		http.Error(w, "launch failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	h.auditEvent(r, "gui.session.start", "ok", map[string]any{
		"id":      sess.ID,
		"display": sess.Display,
		"port":    sess.Port,
		"command": sess.Command,
	})
	writeJSON(w, http.StatusCreated, sess)
}

func (h *Handler) stop(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.mgr.Stop(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			http.Error(w, "session not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.auditEvent(r, "gui.session.stop", "ok", map[string]any{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

// proxy reverse-proxies the request to the per-session xpra HTTP/WS
// server. Called for both /xpra/{id}/foo (HTML/JS/CSS) and the WebSocket
// upgrade path xpra-html5 uses.
func (h *Handler) proxy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rp, ok := h.mgr.Proxy(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	rp.ServeHTTP(w, r)
}

// proxyRedirect handles GET /xpra/{id} (no trailing slash) so the iframe
// loads the index.html naturally — xpra's HTML5 client uses relative
// paths, which break without a trailing slash on the parent URL.
func (h *Handler) proxyRedirect(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, r.URL.Path+"/", http.StatusMovedPermanently)
}

func (h *Handler) auditEvent(r *http.Request, eventType, outcome string, detail map[string]any) {
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
		Outcome: outcome,
		Detail:  detail,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
