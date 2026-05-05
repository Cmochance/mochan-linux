// Package gitclient exposes a guarded Git backend for the Git Client app.
package gitclient

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
)

const (
	maxJSONBytes = 1 << 20
	gitTimeout   = 45 * time.Second
)

var (
	ErrNotFound   = errors.New("git repo not found")
	ErrBadRequest = errors.New("bad git request")
)

type Repo struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	AddedAt time.Time `json:"added_at"`
}

type State struct {
	Repos []Repo `json:"repos"`
}

type Store struct {
	path string
	mu   sync.Mutex
	data State
}

func NewStore(path string) (*Store, error) {
	s := &Store{path: filepath.Join(path, "index.json")}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o750); err != nil {
		return nil, err
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) List() []Repo {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Repo, len(s.data.Repos))
	copy(out, s.data.Repos)
	return out
}

func (s *Store) Add(path, name string) (Repo, error) {
	root, err := canonicalRepoRoot(path)
	if err != nil {
		return Repo{}, err
	}
	if name = strings.TrimSpace(name); name == "" {
		name = filepath.Base(root)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	for _, repo := range s.data.Repos {
		if repo.Path == root {
			return repo, nil
		}
	}
	repo := Repo{
		ID:      randomID(),
		Name:    name,
		Path:    root,
		AddedAt: time.Now().UTC(),
	}
	s.data.Repos = append(s.data.Repos, repo)
	if err := s.saveLocked(); err != nil {
		return Repo{}, err
	}
	return repo, nil
}

func (s *Store) Delete(id string) (Repo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, repo := range s.data.Repos {
		if repo.ID == id {
			s.data.Repos = append(s.data.Repos[:i], s.data.Repos[i+1:]...)
			return repo, s.saveLocked()
		}
	}
	return Repo{}, ErrNotFound
}

func (s *Store) Get(id string) (Repo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, repo := range s.data.Repos {
		if repo.ID == id {
			return repo, nil
		}
	}
	return Repo{}, ErrNotFound
}

func (s *Store) load() error {
	f, err := os.Open(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			s.data = State{Repos: []Repo{}}
			return nil
		}
		return err
	}
	defer f.Close()
	var data State
	if err := json.NewDecoder(io.LimitReader(f, maxJSONBytes)).Decode(&data); err != nil {
		return err
	}
	if data.Repos == nil {
		data.Repos = []Repo{}
	}
	s.data = data
	return nil
}

func (s *Store) saveLocked() error {
	tmp := s.path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o640)
	if err != nil {
		return err
	}
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(s.data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, s.path)
}

type StatusFile struct {
	Path     string `json:"path"`
	OldPath  string `json:"old_path,omitempty"`
	Staged   bool   `json:"staged"`
	Unstaged bool   `json:"unstaged"`
	Change   string `json:"change"`
	Raw      string `json:"raw"`
}

type Status struct {
	Repo          Repo         `json:"repo"`
	Branch        string       `json:"branch"`
	Head          string       `json:"head"`
	Upstream      string       `json:"upstream,omitempty"`
	Ahead         int          `json:"ahead"`
	Behind        int          `json:"behind"`
	Files         []StatusFile `json:"files"`
	WorkingTreeOK bool         `json:"working_tree_clean"`
}

type Commit struct {
	Hash    string `json:"hash"`
	Short   string `json:"short"`
	Subject string `json:"subject"`
	Author  string `json:"author"`
	Date    string `json:"date"`
	Refs    string `json:"refs,omitempty"`
}

type Branch struct {
	Name    string `json:"name"`
	Current bool   `json:"current"`
}

type Handler struct {
	store *Store
	audit *audit.Logger
}

func NewHandler(store *Store, auditLog *audit.Logger) *Handler {
	return &Handler{store: store, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/repos", h.listRepos)
	r.Post("/repos", h.addRepo)
	r.Delete("/repos/{id}", h.deleteRepo)
	r.Get("/repos/{id}/status", h.status)
	r.Get("/repos/{id}/diff", h.diff)
	r.Get("/repos/{id}/log", h.log)
	r.Get("/repos/{id}/branches", h.branches)
	r.Post("/repos/{id}/stage", h.stage)
	r.Post("/repos/{id}/unstage", h.unstage)
	r.Post("/repos/{id}/commit", h.commit)
	r.Post("/repos/{id}/checkout", h.checkout)
	r.Post("/repos/{id}/branch", h.createBranch)
	r.Post("/repos/{id}/fetch", h.fetch)
	r.Post("/repos/{id}/pull", h.pull)
	r.Post("/repos/{id}/merge", h.merge)
}

func (h *Handler) listRepos(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"repos": h.store.List()})
}

func (h *Handler) addRepo(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	repo, err := h.store.Add(body.Path, body.Name)
	if err != nil {
		writeGitError(w, err)
		h.auditEvent(r, "git.repo.add", "error", map[string]any{"error": errString(err)})
		return
	}
	h.auditEvent(r, "git.repo.add", "ok", map[string]any{"repo_id": repo.ID, "path": repo.Path})
	writeJSON(w, http.StatusCreated, repo)
}

func (h *Handler) deleteRepo(w http.ResponseWriter, r *http.Request) {
	repo, err := h.store.Delete(chi.URLParam(r, "id"))
	if err != nil {
		writeGitError(w, err)
		return
	}
	h.auditEvent(r, "git.repo.delete", "ok", map[string]any{"repo_id": repo.ID})
	writeJSON(w, http.StatusOK, repo)
}

func (h *Handler) status(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	status, err := repoStatus(r.Context(), repo)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) diff(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	args := []string{"diff", "--", path}
	if r.URL.Query().Get("staged") == "true" {
		args = []string{"diff", "--cached", "--", path}
	}
	out, err := runGit(r.Context(), repo.Path, args...)
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"diff": out})
}

func (h *Handler) log(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	out, err := runGit(r.Context(), repo.Path, "log", "--decorate=short", "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ad%x1f%D", "-n", "80")
	if err != nil {
		writeGitError(w, err)
		return
	}
	commits := []Commit{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\x1f")
		for len(parts) < 6 {
			parts = append(parts, "")
		}
		commits = append(commits, Commit{Hash: parts[0], Short: parts[1], Subject: parts[2], Author: parts[3], Date: parts[4], Refs: parts[5]})
	}
	writeJSON(w, http.StatusOK, map[string]any{"commits": commits})
}

func (h *Handler) branches(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	out, err := runGit(r.Context(), repo.Path, "branch", "--format=%(refname:short)%x1f%(HEAD)")
	if err != nil {
		writeGitError(w, err)
		return
	}
	branches := []Branch{}
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\x1f")
		name := parts[0]
		current := len(parts) > 1 && parts[1] == "*"
		branches = append(branches, Branch{Name: name, Current: current})
	}
	writeJSON(w, http.StatusOK, map[string]any{"branches": branches})
}

func (h *Handler) stage(w http.ResponseWriter, r *http.Request) {
	h.pathsAction(w, r, "git.stage", "add")
}

func (h *Handler) unstage(w http.ResponseWriter, r *http.Request) {
	h.pathsAction(w, r, "git.unstage", "restore", "--staged")
}

func (h *Handler) commit(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	message := strings.TrimSpace(body.Message)
	if message == "" {
		http.Error(w, "message is required", http.StatusBadRequest)
		return
	}
	out, err := runGit(r.Context(), repo.Path, "commit", "-m", message)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "git.commit", outcome, map[string]any{"repo_id": repo.ID, "error": errString(err)})
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"output": out})
}

func (h *Handler) checkout(w http.ResponseWriter, r *http.Request) {
	h.branchAction(w, r, "git.checkout", "switch")
}

func (h *Handler) createBranch(w http.ResponseWriter, r *http.Request) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Name     string `json:"name"`
		Checkout bool   `json:"checkout"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	name, err := validateBranch(body.Name)
	if err != nil {
		writeGitError(w, err)
		return
	}
	args := []string{"branch", name}
	if body.Checkout {
		args = []string{"switch", "-c", name}
	}
	out, err := runGit(r.Context(), repo.Path, args...)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, "git.branch.create", outcome, map[string]any{"repo_id": repo.ID, "branch": name, "checkout": body.Checkout, "error": errString(err)})
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"output": out})
}

func (h *Handler) fetch(w http.ResponseWriter, r *http.Request) {
	h.simpleAction(w, r, "git.fetch", "fetch", "--prune")
}

func (h *Handler) pull(w http.ResponseWriter, r *http.Request) {
	h.simpleAction(w, r, "git.pull", "pull", "--ff-only")
}

func (h *Handler) merge(w http.ResponseWriter, r *http.Request) {
	h.branchAction(w, r, "git.merge", "merge", "--ff")
}

func (h *Handler) pathsAction(w http.ResponseWriter, r *http.Request, eventType string, args ...string) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Paths []string `json:"paths"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	paths := cleanPaths(body.Paths)
	if len(paths) == 0 {
		http.Error(w, "paths are required", http.StatusBadRequest)
		return
	}
	fullArgs := append([]string{}, args...)
	fullArgs = append(fullArgs, "--")
	fullArgs = append(fullArgs, paths...)
	out, err := runGit(r.Context(), repo.Path, fullArgs...)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, eventType, outcome, map[string]any{"repo_id": repo.ID, "count": len(paths), "error": errString(err)})
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"output": out})
}

func (h *Handler) branchAction(w http.ResponseWriter, r *http.Request, eventType string, args ...string) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Branch string `json:"branch"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	branch, err := validateBranch(body.Branch)
	if err != nil {
		writeGitError(w, err)
		return
	}
	fullArgs := append([]string{}, args...)
	fullArgs = append(fullArgs, branch)
	out, err := runGit(r.Context(), repo.Path, fullArgs...)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, eventType, outcome, map[string]any{"repo_id": repo.ID, "branch": branch, "error": errString(err)})
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"output": out})
}

func (h *Handler) simpleAction(w http.ResponseWriter, r *http.Request, eventType string, args ...string) {
	repo, ok := h.repo(w, r)
	if !ok {
		return
	}
	out, err := runGit(r.Context(), repo.Path, args...)
	outcome := "ok"
	if err != nil {
		outcome = "error"
	}
	h.auditEvent(r, eventType, outcome, map[string]any{"repo_id": repo.ID, "error": errString(err)})
	if err != nil {
		writeGitError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"output": out})
}

func (h *Handler) repo(w http.ResponseWriter, r *http.Request) (Repo, bool) {
	repo, err := h.store.Get(chi.URLParam(r, "id"))
	if err != nil {
		writeGitError(w, err)
		return Repo{}, false
	}
	return repo, true
}

func repoStatus(ctx context.Context, repo Repo) (Status, error) {
	branch, _ := runGit(ctx, repo.Path, "branch", "--show-current")
	head, _ := runGit(ctx, repo.Path, "rev-parse", "--short", "HEAD")
	filesOut, err := runGit(ctx, repo.Path, "status", "--porcelain=v1", "-uall")
	if err != nil {
		return Status{}, err
	}
	upstream := ""
	ahead, behind := 0, 0
	if out, err := runGit(ctx, repo.Path, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"); err == nil {
		parts := strings.Fields(out)
		if len(parts) == 2 {
			ahead = atoi(parts[0])
			behind = atoi(parts[1])
			upstream, _ = runGit(ctx, repo.Path, "rev-parse", "--abbrev-ref", "@{upstream}")
		}
	}
	files := parseStatusFiles(filesOut)
	return Status{
		Repo:          repo,
		Branch:        strings.TrimSpace(branch),
		Head:          strings.TrimSpace(head),
		Upstream:      strings.TrimSpace(upstream),
		Ahead:         ahead,
		Behind:        behind,
		Files:         files,
		WorkingTreeOK: len(files) == 0,
	}, nil
}

func parseStatusFiles(out string) []StatusFile {
	files := []StatusFile{}
	for _, line := range strings.Split(out, "\n") {
		if len(line) < 4 {
			continue
		}
		x, y := line[0], line[1]
		path := strings.TrimSpace(line[3:])
		oldPath := ""
		if parts := strings.Split(path, " -> "); len(parts) == 2 {
			oldPath = parts[0]
			path = parts[1]
		}
		files = append(files, StatusFile{
			Path:     path,
			OldPath:  oldPath,
			Staged:   x != ' ' && x != '?',
			Unstaged: y != ' ' || (x == '?' && y == '?'),
			Change:   changeLabel(x, y),
			Raw:      strings.TrimSpace(line[:2]),
		})
	}
	return files
}

func changeLabel(x, y byte) string {
	if x == '?' && y == '?' {
		return "added"
	}
	for _, c := range []byte{x, y} {
		switch c {
		case 'A':
			return "added"
		case 'D':
			return "deleted"
		case 'R':
			return "renamed"
		case 'C':
			return "copied"
		}
	}
	return "modified"
}

func canonicalRepoRoot(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("%w: path is required", ErrBadRequest)
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%w: path must be absolute", ErrBadRequest)
	}
	abs, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	out, err := runGit(context.Background(), abs, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", fmt.Errorf("%w: not a git repository", ErrBadRequest)
	}
	return filepath.Clean(strings.TrimSpace(out)), nil
}

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	cmd.Env = safeEnv()
	out, err := cmd.CombinedOutput()
	text := redactSecrets(string(out))
	if ctx.Err() == context.DeadlineExceeded {
		return text, errors.New("git command timed out")
	}
	if len(text) > 256*1024 {
		text = text[:256*1024] + "\n[output truncated]"
	}
	if err != nil {
		if strings.TrimSpace(text) == "" {
			text = err.Error()
		}
		return text, errors.New(strings.TrimSpace(text))
	}
	return text, nil
}

func safeEnv() []string {
	out := []string{}
	for _, kv := range os.Environ() {
		key := strings.SplitN(kv, "=", 2)[0]
		switch key {
		case "HOME", "PATH", "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "TMPDIR", "TMP", "TEMP":
			out = append(out, kv)
		}
	}
	out = append(out,
		"GIT_TERMINAL_PROMPT=0",
		"GIT_ASKPASS=",
		"SSH_ASKPASS=",
	)
	return out
}

var credentialURL = regexp.MustCompile(`(?i)(https?://)([^/@:\s]+):([^/@\s]+)@`)

func redactSecrets(s string) string {
	s = credentialURL.ReplaceAllString(s, `${1}<redacted>@`)
	for _, key := range []string{"password", "token", "secret", "apikey", "api_key", "access_key"} {
		re := regexp.MustCompile(`(?i)(` + key + `=)[^&\s]+`)
		s = re.ReplaceAllString(s, `${1}<redacted>`)
	}
	return s
}

func validateBranch(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.HasPrefix(raw, "-") || strings.ContainsAny(raw, "\x00\r\n") {
		return "", fmt.Errorf("%w: invalid branch", ErrBadRequest)
	}
	return raw, nil
}

func cleanPaths(paths []string) []string {
	out := []string{}
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" || strings.ContainsRune(p, '\x00') {
			continue
		}
		out = append(out, p)
	}
	return out
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(io.LimitReader(r.Body, maxJSONBytes)).Decode(v); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return false
	}
	return true
}

func writeGitError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	if errors.Is(err, ErrNotFound) {
		status = http.StatusNotFound
	} else if errors.Is(err, ErrBadRequest) {
		status = http.StatusBadRequest
	}
	http.Error(w, err.Error(), status)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func randomID() string {
	var buf [16]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return hex.EncodeToString([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	}
	return hex.EncodeToString(buf[:])
}

func atoi(s string) int {
	var n int
	_, _ = fmt.Sscanf(s, "%d", &n)
	return n
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return redactSecrets(err.Error())
}

func (h *Handler) auditEvent(r *http.Request, eventType, outcome string, detail map[string]any) {
	if h.audit == nil {
		return
	}
	for k, v := range detail {
		if s, ok := v.(string); ok {
			if _, err := url.Parse(s); err == nil {
				detail[k] = redactSecrets(s)
			}
		}
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   "authenticated",
		IP:      audit.ClientIP(r),
		Outcome: outcome,
		Detail:  detail,
	})
}
