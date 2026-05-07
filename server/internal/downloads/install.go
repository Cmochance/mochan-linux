package downloads

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
)

// installSerial guards against parallel apt invocations from the UI. The dpkg
// lock would queue them anyway, but serializing in-process gives us a clean
// 409 instead of a 5-minute hang on the second click.
var installRunning atomic.Bool

// MountInstall registers the .deb install endpoint. Kept on a separate
// router-add so callers that don't want it (e.g. tests, hardened builds
// without sudo) can opt out.
func (h *Handler) MountInstall(r chi.Router) {
	r.Post("/{id}/install", h.installDeb)
}

// FilesDir returns the directory completed downloads are written to. Used by
// installDeb to confirm the requested file lives inside the sandboxed area.
func (m *Manager) FilesDir() string { return m.filesDir }

func (h *Handler) installDeb(w http.ResponseWriter, r *http.Request) {
	job, err := h.manager.Get(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	if job.Status != StatusCompleted {
		http.Error(w, "download not finished", http.StatusConflict)
		return
	}
	if !strings.EqualFold(filepath.Ext(job.FileName), ".deb") {
		http.Error(w, "not a .deb file", http.StatusBadRequest)
		return
	}

	// Defense in depth: the OutputPath must resolve inside the manager's
	// files directory. Manager already guarantees this when it writes, but
	// the index file is on disk and could in theory be tampered with.
	abs, err := filepath.Abs(job.OutputPath)
	if err != nil {
		http.Error(w, "bad output path", http.StatusBadRequest)
		return
	}
	filesDir := h.manager.FilesDir()
	rel, err := filepath.Rel(filesDir, abs)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		http.Error(w, "output path outside downloads sandbox", http.StatusForbidden)
		return
	}

	if !installRunning.CompareAndSwap(false, true) {
		http.Error(w, "another install is already running", http.StatusConflict)
		return
	}
	defer installRunning.Store(false)

	// Stream output as text/event-stream. The frontend reads via fetch()
	// and parses each `data:` line; an `event: exit` frame carries the
	// final exit code. Why SSE over plain chunked text: easier to scan
	// for the terminating event without inventing a sentinel that could
	// collide with apt's own output.
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no") // disable Nginx buffering
	w.WriteHeader(http.StatusOK)

	send := func(event, data string) {
		// SSE: split data on \n so multi-line chunks render correctly.
		if event != "" {
			fmt.Fprintf(w, "event: %s\n", event)
		}
		for _, line := range strings.Split(data, "\n") {
			fmt.Fprintf(w, "data: %s\n", line)
		}
		fmt.Fprint(w, "\n")
		flusher.Flush()
	}

	actor := ""
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		actor = c.Subject
	}
	h.auditEvent(r, "sys.deb.install.start", map[string]any{
		"id":     job.ID,
		"path":   abs,
		"actor":  actor,
		"name":   job.FileName,
	})

	send("", fmt.Sprintf("==> 安装 %s", filepath.Base(abs)))
	send("", "==> 命令: sudo -n apt-get install -y --no-install-recommends "+abs)
	send("", "")

	// 10-minute hard cap. apt downloading transitive deps over a slow
	// link can take a while; longer than this and something is wrong.
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sudo", "-n",
		"apt-get", "install", "-y", "--no-install-recommends", "--", abs)
	// Force non-interactive: apt will not prompt for config diffs etc.
	cmd.Env = append(cmd.Env,
		"DEBIAN_FRONTEND=noninteractive",
		"LC_ALL=C.UTF-8",
		"LANG=C.UTF-8",
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		send("exit", "-1: pipe stdout: "+err.Error())
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		send("exit", "-1: pipe stderr: "+err.Error())
		return
	}
	if err := cmd.Start(); err != nil {
		send("exit", "-1: start: "+err.Error())
		h.auditEvent(r, "sys.deb.install.fail", map[string]any{"id": job.ID, "error": err.Error()})
		return
	}

	pump := func(label string, rc io.ReadCloser) <-chan struct{} {
		done := make(chan struct{})
		go func() {
			defer close(done)
			s := bufio.NewScanner(rc)
			s.Buffer(make([]byte, 64*1024), 1024*1024)
			for s.Scan() {
				send("", label+s.Text())
			}
		}()
		return done
	}
	d1 := pump("", stdout)
	d2 := pump("[err] ", stderr)
	<-d1
	<-d2

	exitCode := 0
	if waitErr := cmd.Wait(); waitErr != nil {
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
			send("", "==> 进程错误: "+waitErr.Error())
		}
	}

	send("exit", fmt.Sprintf("%d", exitCode))

	outcome := "ok"
	if exitCode != 0 {
		outcome = "error"
	}
	if h.audit != nil {
		h.audit.Log(r.Context(), audit.Event{
			Type:    "sys.deb.install.done",
			Actor:   actor,
			IP:      audit.ClientIP(r),
			Outcome: outcome,
			Detail: map[string]any{
				"id":        job.ID,
				"path":      abs,
				"name":      job.FileName,
				"exit_code": exitCode,
			},
		})
	}
}
