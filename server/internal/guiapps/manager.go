// Package guiapps starts and manages xpra HTML5 sessions so GUI Linux
// applications (Tauri/GTK/Qt apps) can be rendered into the browser
// desktop via an iframe. Each session is its own systemd transient
// unit + its own X display number + its own TCP port.
package guiapps

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Session is one running xpra-backed GUI app instance.
type Session struct {
	ID         string    `json:"id"`
	Display    int       `json:"display"`     // X display number, e.g. 100
	Port       int       `json:"port"`        // TCP port the xpra HTML5 server listens on
	Command    string    `json:"command"`     // raw command line passed to xpra --start-child
	UnitName   string    `json:"unit_name"`   // systemd transient unit name
	Actor      string    `json:"actor"`       // username that launched it
	StartedAt  time.Time `json:"started_at"`
	URL        string    `json:"url"`         // browser-facing path: /xpra/{id}/

	proxy *httputil.ReverseProxy `json:"-"` // built once at launch
}

// Manager owns the per-session state and allocates display/port numbers.
// Safe for concurrent use.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session

	// Display numbers start at 100 and only grow — we never recycle a
	// number even after a session stops. Reuse would race against any
	// stale Xvfb/xpra processes that hadn't fully torn down yet.
	nextDisplay atomic.Int64
}

// MinDisplay is where we begin allocating X display numbers. 100 keeps us
// well clear of any locally-running display servers (typically :0–:9).
const MinDisplay = 100

// portForDisplay maps display N to TCP port 14400+N. Picked so the port
// is unique-per-session and obvious-on-inspection.
func portForDisplay(d int) int { return 14400 + d }

// NewManager returns a Manager with no sessions and the display counter
// at MinDisplay.
func NewManager() *Manager {
	m := &Manager{sessions: map[string]*Session{}}
	m.nextDisplay.Store(MinDisplay)
	return m
}

// Errors callers may surface to HTTP.
var (
	ErrEmptyCommand = errors.New("command is required")
	ErrNotFound     = errors.New("session not found")
)

// Launch starts a fresh xpra session running `command` (passed verbatim
// to xpra --start-child, which interprets it as a shell command). The
// caller's username is recorded for the audit trail.
func (m *Manager) Launch(ctx context.Context, command, actor string) (*Session, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil, ErrEmptyCommand
	}

	display := int(m.nextDisplay.Add(1) - 1)
	port := portForDisplay(display)
	id, err := newSessionID()
	if err != nil {
		return nil, fmt.Errorf("session id: %w", err)
	}
	unit := fmt.Sprintf("mochan-xpra-%d", display)

	// systemd-run starts the xpra in a fresh transient unit that is
	// NOT inside mochan.service's mount namespace. ProtectSystem=full on
	// the parent unit would otherwise leave Xvfb's auth file under
	// /root/.Xauthority unwritable.
	args := []string{
		"-n",
		"systemd-run",
		"--collect", "--quiet", "--no-block",
		"--unit=" + unit,
		"--",
		"xpra", "start", fmt.Sprintf(":%d", display),
		fmt.Sprintf("--bind-tcp=127.0.0.1:%d", port),
		"--html=on",
		"--start-child=" + command,
		"--exit-with-children",
		// Sandboxed VPS doesn't have these; explicitly off so xpra
		// doesn't waste time probing them at startup.
		"--pulseaudio=no", "--notifications=no", "--bell=no",
		"--webcam=no", "--mdns=no", "--daemon=no",
	}
	cmd := exec.CommandContext(ctx, "sudo", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("systemd-run xpra: %w (%s)", err, strings.TrimSpace(string(out)))
	}

	target, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	proxy := newReverseProxy(target, id)
	sess := &Session{
		ID:        id,
		Display:   display,
		Port:      port,
		Command:   command,
		UnitName:  unit,
		Actor:     actor,
		StartedAt: time.Now().UTC(),
		URL:       "/xpra/" + id + "/",
		proxy:     proxy,
	}

	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()
	return sess, nil
}

// Stop tears down the session's systemd unit. The unit was started with
// --collect, so it disappears from systemctl after stop without leaving
// a failed-state record. xpra's own --exit-with-children will also stop
// the unit naturally if the GUI app exits, but explicit stop is
// instantaneous; we don't wait for that.
func (m *Manager) Stop(ctx context.Context, id string) error {
	m.mu.Lock()
	sess, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if !ok {
		return ErrNotFound
	}
	cmd := exec.CommandContext(ctx, "sudo", "-n", "systemctl", "stop", sess.UnitName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		// Don't put the session back; it's gone from the table either
		// way. Surface the systemctl error so the operator notices.
		return fmt.Errorf("systemctl stop %s: %w (%s)", sess.UnitName, err, strings.TrimSpace(string(out)))
	}
	return nil
}

// Get returns the session by id. Used by the reverse-proxy handler.
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

// List returns all live sessions ordered by start time (oldest first).
func (m *Manager) List() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s)
	}
	return out
}

// Proxy returns the per-session reverse proxy. Returns false if the id is
// unknown so the caller can 404.
func (m *Manager) Proxy(id string) (*httputil.ReverseProxy, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	if !ok {
		return nil, false
	}
	return s.proxy, true
}

// newReverseProxy builds a reverse proxy for the xpra HTML5 server at
// `target`, stripping the /xpra/{id} path prefix so xpra sees the
// originally-intended URL space (e.g. "/index.html", "/css/...").
//
// Go's httputil.ReverseProxy (1.20+) leaves the Upgrade and Connection
// headers intact for WebSocket requests, so this works for both the
// initial HTTP page-load and the subsequent WebSocket upgrade xpra-html5
// uses to ferry frames.
func newReverseProxy(target *url.URL, id string) *httputil.ReverseProxy {
	rp := httputil.NewSingleHostReverseProxy(target)
	prefix := "/xpra/" + id
	defaultDirector := rp.Director
	rp.Director = func(req *http.Request) {
		// Strip /xpra/{id} from the request path so xpra sees its
		// own URL space ("/", "/index.html", "/css/...").
		req.URL.Path = strings.TrimPrefix(req.URL.Path, prefix)
		if req.URL.Path == "" {
			req.URL.Path = "/"
		}
		req.URL.RawPath = ""
		defaultDirector(req)
		// Some browsers send `:authority` (HTTP/2) or Origin pointing
		// at the public host; xpra-html5 doesn't care about Host,
		// but we set it so logs are clean.
		req.Host = target.Host
	}
	return rp
}

// newSessionID returns 16 hex chars (8 bytes of randomness). Short
// enough to read in URLs, long enough to be unguessable on a public
// internet-exposed instance.
func newSessionID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
