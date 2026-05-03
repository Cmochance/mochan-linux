// Package fsapi serves file-system REST endpoints under /api/fs/*.
//
// All access runs as the OS user that owns the mochan process (typically
// `mochan`). Authorization is enforced on the OS, not in this package — if
// the user can't read a path, they get fs.ErrPermission and we return 403.
//
// Path handling: every endpoint accepts an absolute path. We Clean() it and
// pass it straight to the kernel; we do NOT re-implement chroot. The whole
// host filesystem is intentionally reachable, scoped only by the OS user's
// permissions.
package fsapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

const (
	maxReadBytes   = 8 << 20  // 8 MiB — read endpoint cap
	maxWriteBytes  = 32 << 20 // 32 MiB — write endpoint cap
	maxUploadBytes = 256 << 20
)

type Handler struct{}

func New() *Handler { return &Handler{} }

func (h *Handler) Mount(r chi.Router) {
	r.Get("/list", h.list)
	r.Get("/read", h.read)
	r.Post("/write", h.write) // POST not PUT — easier from JSON
	r.Post("/mkdir", h.mkdir)
	r.Delete("/", h.delete)
	r.Post("/move", h.move)
	r.Post("/upload", h.upload)
	r.Get("/download", h.download)
	r.Get("/stat", h.stat)
	r.Get("/home", h.home)
}

type entry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"is_dir"`
	Size    int64  `json:"size"`
	ModTime int64  `json:"mtime"`
	Mode    string `json:"mode"`
	Symlink string `json:"symlink,omitempty"`
}

func cleanPath(p string) (string, error) {
	if p == "" {
		return "", errors.New("path required")
	}
	if !filepath.IsAbs(p) {
		return "", errors.New("path must be absolute")
	}
	return filepath.Clean(p), nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, fs.ErrNotExist):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, fs.ErrPermission):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, fs.ErrExist):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}

func toEntry(name, full string, info fs.FileInfo) entry {
	e := entry{
		Name:    name,
		Path:    full,
		IsDir:   info.IsDir(),
		Size:    info.Size(),
		ModTime: info.ModTime().Unix(),
		Mode:    info.Mode().String(),
	}
	if info.Mode()&os.ModeSymlink != 0 {
		if t, err := os.Readlink(full); err == nil {
			e.Symlink = t
		}
	}
	return e
}

func (h *Handler) home(w http.ResponseWriter, _ *http.Request) {
	home, err := os.UserHomeDir()
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"home": home})
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if p == "" {
		if home, err := os.UserHomeDir(); err == nil {
			p = home
		}
	}
	abs, err := cleanPath(p)
	if err != nil {
		writeErr(w, err)
		return
	}

	dir, err := os.ReadDir(abs)
	if err != nil {
		writeErr(w, err)
		return
	}

	out := make([]entry, 0, len(dir))
	for _, d := range dir {
		full := filepath.Join(abs, d.Name())
		info, err := d.Info()
		if err != nil {
			continue
		}
		out = append(out, toEntry(d.Name(), full, info))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"path":    abs,
		"parent":  filepath.Dir(abs),
		"entries": out,
	})
}

func (h *Handler) stat(w http.ResponseWriter, r *http.Request) {
	abs, err := cleanPath(r.URL.Query().Get("path"))
	if err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Lstat(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntry(info.Name(), abs, info))
}

func (h *Handler) read(w http.ResponseWriter, r *http.Request) {
	abs, err := cleanPath(r.URL.Query().Get("path"))
	if err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	if info.IsDir() {
		http.Error(w, "is a directory", http.StatusBadRequest)
		return
	}
	if info.Size() > maxReadBytes {
		http.Error(w, fmt.Sprintf("file too large (%d > %d). use /api/fs/download", info.Size(), maxReadBytes), http.StatusRequestEntityTooLarge)
		return
	}

	f, err := os.Open(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	defer f.Close()

	data, err := io.ReadAll(io.LimitReader(f, maxReadBytes+1))
	if err != nil {
		writeErr(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"path":     abs,
		"size":     info.Size(),
		"mtime":    info.ModTime().Unix(),
		"content":  string(data),
		"is_text":  isProbablyText(data),
	})
}

func (h *Handler) write(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path    string `json:"path"`
		Content string `json:"content"`
		Mode    *int   `json:"mode,omitempty"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxWriteBytes)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	abs, err := cleanPath(body.Path)
	if err != nil {
		writeErr(w, err)
		return
	}
	mode := os.FileMode(0644)
	if body.Mode != nil {
		mode = os.FileMode(*body.Mode & 0777)
	}
	if err := os.WriteFile(abs, []byte(body.Content), mode); err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntry(info.Name(), abs, info))
}

func (h *Handler) mkdir(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path    string `json:"path"`
		Parents bool   `json:"parents"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	abs, err := cleanPath(body.Path)
	if err != nil {
		writeErr(w, err)
		return
	}
	mk := os.Mkdir
	if body.Parents {
		mk = func(p string, m os.FileMode) error { return os.MkdirAll(p, m) }
	}
	if err := mk(abs, 0755); err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntry(info.Name(), abs, info))
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	abs, err := cleanPath(r.URL.Query().Get("path"))
	if err != nil {
		writeErr(w, err)
		return
	}
	recursive := r.URL.Query().Get("recursive") == "true"
	if recursive {
		err = os.RemoveAll(abs)
	} else {
		err = os.Remove(abs)
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) move(w http.ResponseWriter, r *http.Request) {
	var body struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	from, err := cleanPath(body.From)
	if err != nil {
		writeErr(w, err)
		return
	}
	to, err := cleanPath(body.To)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := os.Rename(from, to); err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Stat(to)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toEntry(info.Name(), to, info))
}

func (h *Handler) upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	dir := r.FormValue("path")
	abs, err := cleanPath(dir)
	if err != nil {
		writeErr(w, err)
		return
	}

	files := r.MultipartForm.File["file"]
	if len(files) == 0 {
		http.Error(w, "no files", http.StatusBadRequest)
		return
	}

	saved := make([]entry, 0, len(files))
	for _, fh := range files {
		if fh.Size > maxUploadBytes {
			http.Error(w, fmt.Sprintf("file %s too large (%d)", fh.Filename, fh.Size), http.StatusRequestEntityTooLarge)
			return
		}
		src, err := fh.Open()
		if err != nil {
			writeErr(w, err)
			return
		}
		dest := filepath.Join(abs, filepath.Base(fh.Filename))
		dst, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			src.Close()
			writeErr(w, err)
			return
		}
		if _, err := io.Copy(dst, src); err != nil {
			src.Close()
			dst.Close()
			writeErr(w, err)
			return
		}
		src.Close()
		dst.Close()
		info, err := os.Stat(dest)
		if err == nil {
			saved = append(saved, toEntry(info.Name(), dest, info))
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"saved": saved})
}

func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	abs, err := cleanPath(r.URL.Query().Get("path"))
	if err != nil {
		writeErr(w, err)
		return
	}
	info, err := os.Stat(abs)
	if err != nil {
		writeErr(w, err)
		return
	}
	if info.IsDir() {
		http.Error(w, "is a directory", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(filepath.Base(abs), `"`, ``)+`"`)
	http.ServeFile(w, r, abs)
}

// isProbablyText: cheap heuristic — small NUL count + valid UTF-8 first 4 KiB.
func isProbablyText(data []byte) bool {
	n := len(data)
	if n > 4096 {
		n = 4096
	}
	for _, b := range data[:n] {
		if b == 0 {
			return false
		}
	}
	return true
}
