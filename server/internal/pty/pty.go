package pty

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/alysechen/mochan-linux/server/internal/auth"
)

// Handler bridges browser WebSockets to long-lived PTY sessions.
type Handler struct {
	auth *auth.Authenticator
	mgr  *Manager
}

// New creates a Handler with the given idle TTL for unattended sessions.
// idleTTL <= 0 → 5 minute default.
func New(a *auth.Authenticator, idleTTL time.Duration) *Handler {
	return &Handler{auth: a, mgr: NewManager(idleTTL)}
}

// Close shuts down the manager and reaps all sessions.
func (h *Handler) Close() { h.mgr.Close() }

// Control messages between browser and server (text frames).
type controlIn struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols,omitempty"`
	Rows uint16 `json:"rows,omitempty"`
}

type controlOut struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id,omitempty"`
	Cols      uint16 `json:"cols,omitempty"`
	Rows      uint16 `json:"rows,omitempty"`
	BufferLen int    `json:"buffer_len,omitempty"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h.checkToken(r); err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"linux.mochance.xyz", "localhost:*", "127.0.0.1:*"},
	})
	if err != nil {
		log.Printf("pty: accept failed: %v", err)
		return
	}
	conn.SetReadLimit(1 << 20)
	defer conn.CloseNow()

	cols := uint16Param(r, "cols", 80)
	rows := uint16Param(r, "rows", 24)

	requestedID := r.URL.Query().Get("session")

	homeDir, _ := os.UserHomeDir()
	session, created, err := h.mgr.GetOrCreate(requestedID, SessionOptions{
		Cols:    cols,
		Rows:    rows,
		WorkDir: homeDir,
	})
	if err != nil {
		log.Printf("pty: session create failed: %v", err)
		_ = conn.Close(websocket.StatusInternalError, "session create failed")
		return
	}

	// Apply (potentially updated) terminal size from this client.
	_ = session.Resize(cols, rows)

	subID, ch, snapshot := session.Subscribe()
	defer session.Unsubscribe(subID)

	if created {
		log.Printf("pty: created session %s (cols=%d rows=%d)", session.ID, cols, rows)
	} else {
		log.Printf("pty: attached to session %s (replay %d bytes)", session.ID, len(snapshot))
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// 1) Send the "attached" control frame so the client can latch the ID.
	if err := writeControl(ctx, conn, controlOut{
		Type:      "attached",
		SessionID: session.ID,
		Cols:      cols,
		Rows:      rows,
		BufferLen: len(snapshot),
	}); err != nil {
		return
	}

	// 2) Replay the buffer (binary).
	if len(snapshot) > 0 {
		if err := conn.Write(ctx, websocket.MessageBinary, snapshot); err != nil {
			return
		}
	}

	// 3) Bridge in both directions.
	var wg sync.WaitGroup
	wg.Add(2)

	// session → ws
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case <-session.Done():
				cancel()
				return
			case data, ok := <-ch:
				if !ok {
					cancel()
					return
				}
				if err := conn.Write(ctx, websocket.MessageBinary, data); err != nil {
					cancel()
					return
				}
			}
		}
	}()

	// ws → session
	go func() {
		defer wg.Done()
		for {
			typ, data, err := conn.Read(ctx)
			if err != nil {
				cancel()
				return
			}
			switch typ {
			case websocket.MessageBinary:
				if _, err := session.Write(data); err != nil {
					cancel()
					return
				}
			case websocket.MessageText:
				var ctl controlIn
				if json.Unmarshal(data, &ctl) != nil {
					continue
				}
				switch ctl.Type {
				case "resize":
					_ = session.Resize(ctl.Cols, ctl.Rows)
				}
			}
		}
	}()

	wg.Wait()
	_ = conn.Close(websocket.StatusNormalClosure, "session detached")
}

func (h *Handler) checkToken(r *http.Request) error {
	tok := r.URL.Query().Get("token")
	if tok == "" {
		if c, err := r.Cookie("mochan_token"); err == nil {
			tok = c.Value
		}
	}
	if tok == "" {
		return errors.New("missing token")
	}
	if _, err := h.auth.Parse(tok); err != nil {
		return errors.New("invalid token")
	}
	return nil
}

func writeControl(ctx context.Context, conn *websocket.Conn, ctl controlOut) error {
	buf, err := json.Marshal(ctl)
	if err != nil {
		return err
	}
	return conn.Write(ctx, websocket.MessageText, buf)
}

func uint16Param(r *http.Request, name string, fallback uint16) uint16 {
	v := r.URL.Query().Get(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseUint(v, 10, 16)
	if err != nil || n == 0 {
		return fallback
	}
	return uint16(n)
}
