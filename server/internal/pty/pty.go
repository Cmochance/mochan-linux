package pty

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"

	"github.com/coder/websocket"
	creackpty "github.com/creack/pty"

	"github.com/alysechen/mochan-linux/server/internal/auth"
)

type Handler struct {
	auth *auth.Authenticator
}

func New(a *auth.Authenticator) *Handler {
	return &Handler{auth: a}
}

type controlMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h.checkToken(r); err != nil {
		http.Error(w, err.Error(), http.StatusUnauthorized)
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Browser is same-origin via Cloudflare → NPM → us. No CSWSH worry,
		// but still validate explicitly: only allow our public host.
		OriginPatterns: []string{"linux.mochance.xyz", "localhost:*", "127.0.0.1:*"},
	})
	if err != nil {
		log.Printf("pty: websocket accept failed: %v", err)
		return
	}
	conn.SetReadLimit(1 << 20) // 1 MiB; browser writes are tiny key strokes
	defer conn.CloseNow()

	cols := uint16Param(r, "cols", 80)
	rows := uint16Param(r, "rows", 24)

	cmd := exec.Command("bash", "-l")
	homeDir, _ := os.UserHomeDir()
	if homeDir != "" {
		cmd.Dir = homeDir
	}
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
	)

	ptmx, err := creackpty.StartWithSize(cmd, &creackpty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		log.Printf("pty: start failed: %v", err)
		_ = conn.Close(websocket.StatusInternalError, "pty start failed")
		return
	}
	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	}()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)

	// PTY → WS
	go func() {
		defer wg.Done()
		buf := make([]byte, 32*1024)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				if werr := conn.Write(ctx, websocket.MessageBinary, buf[:n]); werr != nil {
					cancel()
					return
				}
			}
			if err != nil {
				if !errors.Is(err, io.EOF) && ctx.Err() == nil {
					log.Printf("pty: read err: %v", err)
				}
				cancel()
				return
			}
		}
	}()

	// WS → PTY
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
				if _, err := ptmx.Write(data); err != nil {
					cancel()
					return
				}
			case websocket.MessageText:
				var ctl controlMsg
				if err := json.Unmarshal(data, &ctl); err != nil {
					continue
				}
				if ctl.Type == "resize" && ctl.Cols > 0 && ctl.Rows > 0 {
					_ = creackpty.Setsize(ptmx, &creackpty.Winsize{Cols: ctl.Cols, Rows: ctl.Rows})
				}
			}
		}
	}()

	wg.Wait()
	_ = conn.Close(websocket.StatusNormalClosure, "session ended")
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
