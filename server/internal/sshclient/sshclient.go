// Package sshclient bridges browser WebSockets to real SSH sessions.
package sshclient

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/crypto/ssh"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

type Handler struct {
	auth  *auth.Authenticator
	audit *audit.Logger
}

func New(a *auth.Authenticator, auditLog *audit.Logger) *Handler {
	return &Handler{auth: a, audit: auditLog}
}

type connectMessage struct {
	Type          string `json:"type"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	Username      string `json:"username"`
	Password      string `json:"password"`
	HostKeyPolicy string `json:"host_key_policy"`
	Cols          int    `json:"cols"`
	Rows          int    `json:"rows"`
}

type inputMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

type outputMessage struct {
	Type    string `json:"type"`
	Data    string `json:"data,omitempty"`
	Message string `json:"message,omitempty"`
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
		log.Printf("ssh: accept failed: %v", err)
		return
	}
	conn.SetReadLimit(2 << 20)
	defer conn.CloseNow()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	writer := &wsWriter{conn: conn}

	typ, data, err := conn.Read(ctx)
	if err != nil {
		return
	}
	if typ != websocket.MessageText {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: "first message must be a connect request"})
		return
	}
	var first connectMessage
	if err := json.Unmarshal(data, &first); err != nil || first.Type != "connect" {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: "bad connect request"})
		return
	}
	if first.Port == 0 {
		first.Port = 22
	}
	if first.Cols <= 0 {
		first.Cols = 80
	}
	if first.Rows <= 0 {
		first.Rows = 24
	}
	if first.HostKeyPolicy == "" {
		first.HostKeyPolicy = "session"
	}

	client, err := h.dial(ctx, first)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "ssh.connect", outcome, map[string]any{"host": first.Host, "port": first.Port, "user": first.Username, "policy": first.HostKeyPolicy, "error": errString(err)})
	if err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", first.Rows, first.Cols, modes); err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	if err := session.Shell(); err != nil {
		_ = writer.write(ctx, outputMessage{Type: "error", Message: err.Error()})
		return
	}
	if err := writer.write(ctx, outputMessage{Type: "connected", Message: "connected"}); err != nil {
		return
	}

	var wg sync.WaitGroup
	wg.Add(3)
	go pipeReader(ctx, cancel, writer, stdout, &wg)
	go pipeReader(ctx, cancel, writer, stderr, &wg)
	go func() {
		defer wg.Done()
		for {
			typ, data, err := conn.Read(ctx)
			if err != nil {
				cancel()
				return
			}
			if typ != websocket.MessageText {
				continue
			}
			var msg inputMessage
			if json.Unmarshal(data, &msg) != nil {
				continue
			}
			switch msg.Type {
			case "input":
				if _, err := io.WriteString(stdin, msg.Data); err != nil {
					cancel()
					return
				}
			case "resize":
				_ = session.WindowChange(msg.Rows, msg.Cols)
			case "close":
				cancel()
				return
			}
		}
	}()
	wg.Wait()
	_ = writer.write(context.Background(), outputMessage{Type: "closed", Message: "session closed"})
}

func (h *Handler) dial(ctx context.Context, msg connectMessage) (*ssh.Client, error) {
	host := strings.TrimSpace(msg.Host)
	user := strings.TrimSpace(msg.Username)
	if host == "" || user == "" {
		return nil, errors.New("host and username are required")
	}
	if msg.Port == 0 {
		msg.Port = 22
	}
	if msg.Port < 0 || msg.Port > 65535 {
		return nil, errors.New("invalid port")
	}
	authMethods := []ssh.AuthMethod{}
	if msg.Password != "" {
		authMethods = append(authMethods, ssh.Password(msg.Password))
	}
	if len(authMethods) == 0 {
		return nil, errors.New("password authentication is required for this session")
	}
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         12 * time.Second,
	}
	addr := net.JoinHostPort(host, strconv.Itoa(msg.Port))
	conn, err := netguard.GuardedDialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, addr, cfg)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return ssh.NewClient(sshConn, chans, reqs), nil
}

type wsWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (w *wsWriter) write(ctx context.Context, msg outputMessage) error {
	buf, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn.Write(ctx, websocket.MessageText, buf)
}

func pipeReader(ctx context.Context, cancel context.CancelFunc, writer *wsWriter, r io.Reader, wg *sync.WaitGroup) {
	defer wg.Done()
	buf := make([]byte, 16*1024)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			if writer.write(ctx, outputMessage{Type: "data", Data: string(buf[:n])}) != nil {
				cancel()
				return
			}
		}
		if err != nil {
			cancel()
			return
		}
	}
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

func errString(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("%v", err)
}
