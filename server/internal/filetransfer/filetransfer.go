// Package filetransfer implements SFTP-like file operations over SSH.
package filetransfer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/ssh"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

const maxJSONBytes = 8 << 20

var ErrBadRequest = errors.New("bad file transfer request")

type Connection struct {
	Protocol string `json:"protocol"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
}

type Entry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"is_dir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"mtime"`
}

type Handler struct {
	audit *audit.Logger
}

func NewHandler(auditLog *audit.Logger) *Handler {
	return &Handler{audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/connect", h.connect)
	r.Post("/list", h.list)
	r.Post("/mkdir", h.mkdir)
	r.Post("/delete", h.delete)
	r.Post("/upload", h.upload)
	r.Post("/download", h.download)
}

func (h *Handler) connect(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	client, err := dial(r.Context(), body.Connection)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "filetransfer.connect", outcome, map[string]any{"host": body.Connection.Host, "port": body.Connection.Port, "user": body.Connection.Username, "protocol": protocol(body.Connection), "error": errString(err)})
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	pwd, err := runRemote(client, "pwd")
	if err != nil {
		writeTransferError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"connected": true, "protocol": protocol(body.Connection), "cwd": strings.TrimSpace(pwd)})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
		Path       string     `json:"path"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	client, err := dial(r.Context(), body.Connection)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	target := remotePathOrHome(body.Path)
	entries, err := listRemote(client, target)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": target, "entries": entries})
}

func (h *Handler) mkdir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
		Path       string     `json:"path"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	client, err := dial(r.Context(), body.Connection)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	target, err := cleanRemotePath(body.Path)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	_, err = runRemote(client, "mkdir -p -- "+shellQuote(target))
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "filetransfer.mkdir", outcome, map[string]any{"host": body.Connection.Host, "path": target, "error": errString(err)})
	if err != nil {
		writeTransferError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": target})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
		Path       string     `json:"path"`
		Recursive  bool       `json:"recursive"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	client, err := dial(r.Context(), body.Connection)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	target, err := cleanRemotePath(body.Path)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	args := "rm -f -- "
	if body.Recursive {
		args = "rm -rf -- "
	}
	_, err = runRemote(client, args+shellQuote(target))
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "filetransfer.delete", outcome, map[string]any{"host": body.Connection.Host, "path": target, "recursive": body.Recursive, "error": errString(err)})
	if err != nil {
		writeTransferError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": target})
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
		LocalPath  string     `json:"local_path"`
		RemotePath string     `json:"remote_path"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	localPath, err := cleanLocalPath(body.LocalPath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	remotePath, err := cleanRemotePath(body.RemotePath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	data, err := os.ReadFile(localPath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	client, err := dial(r.Context(), body.Connection)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	err = writeRemote(client, remotePath, data)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "filetransfer.upload", outcome, map[string]any{"host": body.Connection.Host, "local_path": localPath, "remote_path": remotePath, "bytes": len(data), "error": errString(err)})
	if err != nil {
		writeTransferError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"local_path": localPath, "remote_path": remotePath, "bytes": len(data)})
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Connection Connection `json:"connection"`
		RemotePath string     `json:"remote_path"`
		LocalPath  string     `json:"local_path"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	remotePath, err := cleanRemotePath(body.RemotePath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	localPath, err := cleanLocalPath(body.LocalPath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	client, err := dial(r.Context(), body.Connection)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	defer client.Close()
	data, err := readRemote(client, remotePath)
	if err != nil {
		writeTransferError(w, err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(localPath), 0o750); err != nil {
		writeTransferError(w, err)
		return
	}
	if err := os.WriteFile(localPath, data, 0o640); err != nil {
		writeTransferError(w, err)
		return
	}
	h.auditEvent(r, "filetransfer.download", "ok", map[string]any{"host": body.Connection.Host, "remote_path": remotePath, "local_path": localPath, "bytes": len(data)})
	writeJSON(w, http.StatusOK, map[string]any{"remote_path": remotePath, "local_path": localPath, "bytes": len(data)})
}

func dial(ctx context.Context, conn Connection) (*ssh.Client, error) {
	if protocol(conn) != "sftp" {
		return nil, fmt.Errorf("%w: only sftp over ssh is enabled", ErrBadRequest)
	}
	host := strings.TrimSpace(conn.Host)
	user := strings.TrimSpace(conn.Username)
	if host == "" || user == "" {
		return nil, fmt.Errorf("%w: host and username are required", ErrBadRequest)
	}
	port := conn.Port
	if port == 0 {
		port = 22
	}
	if port < 1 || port > 65535 {
		return nil, fmt.Errorf("%w: invalid port", ErrBadRequest)
	}
	if conn.Password == "" {
		return nil, fmt.Errorf("%w: password is required for this session", ErrBadRequest)
	}
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(conn.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         12 * time.Second,
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	tcp, err := netguard.GuardedDialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(tcp, addr, cfg)
	if err != nil {
		_ = tcp.Close()
		return nil, err
	}
	return ssh.NewClient(sshConn, chans, reqs), nil
}

func protocol(conn Connection) string {
	p := strings.ToLower(strings.TrimSpace(conn.Protocol))
	if p == "" {
		return "sftp"
	}
	return p
}

func listRemote(client *ssh.Client, dir string) ([]Entry, error) {
	script := `dir=` + shellQuote(dir) + `
cd "$dir" || exit 2
for f in . .. * .[!.]* ..?*; do
  [ "$f" = "." ] || [ "$f" = ".." ] && continue
  [ -e "$f" ] || continue
  if [ -d "$f" ]; then typ=dir; else typ=file; fi
  size=$(wc -c < "$f" 2>/dev/null || echo 0)
  mt=$(date -r "$f" +%s 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
  printf '%s\t%s\t%s\t%s\n' "$typ" "$size" "$mt" "$f"
done`
	out, err := runRemote(client, script)
	if err != nil {
		return nil, err
	}
	entries := []Entry{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 4)
		if len(parts) != 4 {
			continue
		}
		size, _ := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
		mt, _ := strconv.ParseInt(strings.TrimSpace(parts[2]), 10, 64)
		name := parts[3]
		entries = append(entries, Entry{Name: name, Path: path.Join(dir, name), IsDir: parts[0] == "dir", Size: size, ModTime: mt})
	}
	return entries, nil
}

func readRemote(client *ssh.Client, remotePath string) ([]byte, error) {
	session, err := client.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()
	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr
	err = session.Run("cat -- " + shellQuote(remotePath))
	if err != nil {
		return nil, errors.New(strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

func writeRemote(client *ssh.Client, remotePath string, data []byte) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	var stderr bytes.Buffer
	session.Stderr = &stderr
	dir := path.Dir(remotePath)
	cmd := "mkdir -p -- " + shellQuote(dir) + " && cat > " + shellQuote(remotePath)
	if err := session.Start(cmd); err != nil {
		return err
	}
	if _, err := stdin.Write(data); err != nil {
		_ = stdin.Close()
		return err
	}
	_ = stdin.Close()
	if err := session.Wait(); err != nil {
		return errors.New(strings.TrimSpace(stderr.String()))
	}
	return nil
}

func runRemote(client *ssh.Client, cmd string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	var stdout, stderr bytes.Buffer
	session.Stdout = &stdout
	session.Stderr = &stderr
	if err := session.Run(cmd); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return stdout.String(), errors.New(msg)
	}
	return stdout.String(), nil
}

func remotePathOrHome(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "."
	}
	return raw
}

func cleanRemotePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.ContainsRune(raw, '\x00') {
		return "", fmt.Errorf("%w: remote path is required", ErrBadRequest)
	}
	return path.Clean(raw), nil
}

func cleanLocalPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.ContainsRune(raw, '\x00') {
		return "", fmt.Errorf("%w: local path is required", ErrBadRequest)
	}
	if !filepath.IsAbs(raw) {
		return "", fmt.Errorf("%w: local path must be absolute", ErrBadRequest)
	}
	return filepath.Clean(raw), nil
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(io.LimitReader(r.Body, maxJSONBytes)).Decode(v); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return false
	}
	return true
}

func writeTransferError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, ErrBadRequest) {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
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
	return err.Error()
}
