package downloads

import (
	"bufio"
	"context"
	"errors"
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
	// final exit code, and an `event: status` frame carries the post-
	// install dpkg verdict so the UI can warn even when apt returns 0.
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

	// Read the .deb's package name up-front so we can verify status by
	// name afterwards. dpkg-deb is a local read-only operation; doesn't
	// need sudo and doesn't touch /var/lib/dpkg.
	pkgName, pkgErr := readDebPackageName(abs)
	if pkgErr != nil {
		send("", "==> 无法解析 .deb 包名: "+pkgErr.Error())
	}

	h.auditEvent(r, "sys.deb.install.start", map[string]any{
		"id":      job.ID,
		"path":    abs,
		"actor":   actor,
		"name":    job.FileName,
		"package": pkgName,
	})

	send("", fmt.Sprintf("==> 安装 %s", filepath.Base(abs)))
	if pkgName != "" {
		send("", fmt.Sprintf("==> dpkg 包名: %s", pkgName))
	}
	// We wrap apt with `systemd-run --pipe --wait --collect` so that the
	// child runs in its OWN transient unit instead of inheriting this
	// service's mount namespace. This service hardens itself with
	// ProtectSystem=full (mounts /usr/, /boot/, /etc/ read-only on its
	// view), and a sudo'd child would still be confined to that view —
	// dpkg would fail with "Read-only file system" while unpacking into
	// /usr/lib. systemd-run breaks out cleanly and keeps the parent's
	// hardening intact.
	send("", "==> 命令: sudo -n systemd-run --pipe --wait --collect --quiet -- apt-get install -y -- "+abs)
	send("", "")

	// 10-minute hard cap. apt downloading transitive deps over a slow
	// link can take a while; longer than this and something is wrong.
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()

	// Note: we deliberately keep `Recommends` here. GUI .deb packages
	// commonly list dbus / shared-mime-info / icon themes / WebKit
	// runtime bits as Recommends rather than hard Depends. Skipping
	// them caused the original codex-app-transfer install to leave
	// libwebkit2gtk-4.1-0 in iHR state on dochenmo.
	cmd := exec.CommandContext(ctx, "sudo", "-n",
		"systemd-run", "--pipe", "--wait", "--collect", "--quiet",
		"--setenv=DEBIAN_FRONTEND=noninteractive",
		"--setenv=LC_ALL=C.UTF-8",
		"--setenv=LANG=C.UTF-8",
		"--setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"--",
		"apt-get", "install", "-y", "--", abs)
	// systemd-run carries env via --setenv; we don't need to populate
	// cmd.Env here. (Leaving it default keeps the child inheriting the
	// mochan service's environment, which doesn't matter once apt is in
	// a separate unit anyway.)

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

	// Post-install verdict. apt returning 0 is necessary but not
	// sufficient: dpkg can leave a package in iHR (half-installed +
	// reinst-required) when a maintainer script fails mid-unpack, and
	// apt will still report success. dpkg-query is the source of truth.
	// Default is `unknown` so a missing dpkg-query / unparseable .deb
	// never silently degrades into a "success" claim.
	verdict := "unknown" // success | partial | failed | unknown
	verdictDetail := ""
	if pkgName != "" {
		send("", "")
		send("", fmt.Sprintf("==> 校验 %s 状态: dpkg-query -W -f='${Status}'", pkgName))
		state, qerr := queryDpkgStatus(ctx, pkgName)
		switch {
		case qerr != nil:
			verdict = "unknown"
			verdictDetail = "dpkg-query failed: " + qerr.Error()
			send("", verdictDetail)
		case state == "":
			verdict = "failed"
			verdictDetail = "dpkg 中没有这个包记录,安装未生效"
			send("", verdictDetail)
		case state == "install ok installed":
			verdict = "success"
			send("", "状态: install ok installed ✓")
		default:
			verdict = "partial"
			verdictDetail = "状态: " + state
			send("", verdictDetail)
			send("", "==> 检测到残留,自动清理: dpkg --remove --force-remove-reinstreq "+pkgName)
			cleanupOut, cerr := runCleanup(ctx, pkgName)
			if cleanupOut != "" {
				for _, l := range strings.Split(strings.TrimRight(cleanupOut, "\n"), "\n") {
					send("", "[cleanup] "+l)
				}
			}
			if cerr != nil {
				send("", "[cleanup] 失败: "+cerr.Error())
			} else {
				send("", "[cleanup] 残留已移除,可重新尝试安装")
			}
		}
	} else {
		// No package name to verify against. If apt also exited nonzero
		// this is a hard failure (corrupt .deb, dpkg-deb missing, etc.) —
		// don't soften it to "partial" or "unknown".
		if exitCode != 0 {
			verdict = "failed"
			verdictDetail = "无法读取 .deb 包名 + apt 非零退出"
		} else {
			verdict = "unknown"
			verdictDetail = "未取到包名,无法二次校验"
		}
	}

	// apt failed but dpkg ended up with the package installed — odd
	// (script reported failure post-unpack); flag as partial so the
	// operator looks at the log instead of trusting the green tick.
	if exitCode != 0 && verdict == "success" {
		verdict = "partial"
	}

	send("status", verdict+"|"+verdictDetail)
	send("exit", fmt.Sprintf("%d", exitCode))

	outcome := "ok"
	if verdict != "success" || exitCode != 0 {
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
				"package":   pkgName,
				"exit_code": exitCode,
				"verdict":   verdict,
			},
		})
	}
}

// readDebPackageName runs `dpkg-deb -f <path> Package` to pull the package
// name out of the .deb's control file. Returns empty + error if dpkg-deb
// is missing or the file is not a valid .deb archive.
func readDebPackageName(debPath string) (string, error) {
	cmd := exec.Command("dpkg-deb", "-f", debPath, "Package")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	name := strings.TrimSpace(string(out))
	if name == "" {
		return "", errors.New("dpkg-deb returned empty Package field")
	}
	return name, nil
}

// queryDpkgStatus runs `dpkg-query -W -f=${Status} <pkg>` and returns the
// status string (e.g. "install ok installed", "install ok half-installed").
// Returns ("", nil) when the package is not known to dpkg at all.
func queryDpkgStatus(ctx context.Context, pkg string) (string, error) {
	cmd := exec.CommandContext(ctx, "dpkg-query", "-W", "-f=${Status}", pkg)
	out, err := cmd.Output()
	if err != nil {
		// dpkg-query exits 1 when the package is unknown — treat as ""
		// rather than an error, so callers can map it to "failed".
		if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
			return "", nil
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// runCleanup removes a half-installed package, forcing past the
// reinst-required flag dpkg sets after a failed unpack. We run dpkg
// directly (not apt) because apt refuses to operate on packages in this
// state and we don't want to also pull in side-effects on dependencies.
//
// Wrapped with systemd-run for the same namespace-escape reason as
// the apt path: dpkg --remove also rewrites under /usr/lib, which is
// read-only inside the mochan service's own mount namespace.
func runCleanup(ctx context.Context, pkg string) (string, error) {
	cmd := exec.CommandContext(ctx, "sudo", "-n",
		"systemd-run", "--pipe", "--wait", "--collect", "--quiet",
		"--setenv=DEBIAN_FRONTEND=noninteractive",
		"--setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"--",
		"dpkg", "--remove", "--force-remove-reinstreq", pkg)
	out, err := cmd.CombinedOutput()
	return string(out), err
}
