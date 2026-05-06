// Package downloads runs server-side HTTP downloads for the Download Manager.
package downloads

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

type Status string

const (
	StatusQueued      Status = "queued"
	StatusDownloading Status = "downloading"
	StatusCompleted   Status = "completed"
	StatusFailed      Status = "failed"
	StatusCanceled    Status = "canceled"
)

type Job struct {
	ID          string     `json:"id"`
	URL         string     `json:"url"`
	FileName    string     `json:"file_name"`
	OutputPath  string     `json:"output_path,omitempty"`
	Status      Status     `json:"status"`
	SizeBytes   int64      `json:"size_bytes"`
	Downloaded  int64      `json:"downloaded"`
	SpeedBytes  int64      `json:"speed_bytes"`
	Error       string     `json:"error,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`

	PreferResponseFileName bool `json:"-"`
}

type Manager struct {
	base      string
	filesDir  string
	indexPath string
	client    *http.Client

	mu      sync.RWMutex
	jobs    map[string]*Job
	cancels map[string]context.CancelFunc
}

type indexFile struct {
	Version int   `json:"version"`
	Jobs    []Job `json:"jobs"`
}

var (
	ErrNotFound        = errors.New("download job not found")
	ErrInvalidURL      = errors.New("invalid download url")
	ErrActiveJob       = errors.New("download job is still active")
	ErrTerminalJob     = errors.New("download job is already finished")
	ErrRetryNotAllowed = errors.New("only failed or canceled downloads can be retried")
)

func NewManager(base string) (*Manager, error) {
	absBase, err := filepath.Abs(base)
	if err != nil {
		return nil, err
	}
	m := &Manager{
		base:      absBase,
		filesDir:  filepath.Join(absBase, "files"),
		indexPath: filepath.Join(absBase, "index.json"),
		client:    newClient(),
		jobs:      map[string]*Job{},
		cancels:   map[string]context.CancelFunc{},
	}
	if err := os.MkdirAll(m.filesDir, 0o750); err != nil {
		return nil, err
	}
	if err := m.load(); err != nil {
		return nil, err
	}
	return m, nil
}

func (m *Manager) List() []Job {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]Job, 0, len(m.jobs))
	for _, job := range m.jobs {
		out = append(out, cloneJob(job))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

func (m *Manager) Get(id string) (Job, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	job, ok := m.jobs[id]
	if !ok {
		return Job{}, ErrNotFound
	}
	return cloneJob(job), nil
}

func (m *Manager) Create(rawURL, requestedName string) (Job, error) {
	target, err := parseTargetURL(rawURL)
	if err != nil {
		return Job{}, err
	}
	id, err := newID()
	if err != nil {
		return Job{}, err
	}
	now := time.Now().UTC()
	requestedFileName := sanitizeFileName(requestedName)
	preferResponseFileName := requestedFileName == ""
	fileName := requestedFileName
	if fileName == "" {
		fileName = sanitizeFileName(fileNameFromURL(target))
	}
	if fileName == "" {
		fileName = "download-" + id
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for {
		if _, ok := m.jobs[id]; !ok {
			break
		}
		id, err = newID()
		if err != nil {
			return Job{}, err
		}
	}
	outputPath := m.uniqueOutputPathLocked(fileName)
	job := &Job{
		ID:                     id,
		URL:                    target.String(),
		FileName:               filepath.Base(outputPath),
		OutputPath:             outputPath,
		Status:                 StatusQueued,
		SizeBytes:              -1,
		CreatedAt:              now,
		UpdatedAt:              now,
		PreferResponseFileName: preferResponseFileName,
	}
	m.jobs[id] = job
	if err := m.persistLocked(); err != nil {
		delete(m.jobs, id)
		return Job{}, err
	}
	m.startLocked(id)
	return cloneJob(job), nil
}

func (m *Manager) Cancel(id string) (Job, error) {
	m.mu.Lock()
	job, ok := m.jobs[id]
	if !ok {
		m.mu.Unlock()
		return Job{}, ErrNotFound
	}
	if terminal(job.Status) {
		out := cloneJob(job)
		m.mu.Unlock()
		return out, ErrTerminalJob
	}
	cancel := m.cancels[id]
	out := cloneJob(job)
	m.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	return out, nil
}

func (m *Manager) Retry(id string) (Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return Job{}, ErrNotFound
	}
	if job.Status != StatusFailed && job.Status != StatusCanceled {
		return Job{}, ErrRetryNotAllowed
	}
	now := time.Now().UTC()
	job.Status = StatusQueued
	job.Downloaded = 0
	job.SpeedBytes = 0
	job.SizeBytes = -1
	job.Error = ""
	job.StartedAt = nil
	job.CompletedAt = nil
	job.UpdatedAt = now
	job.OutputPath = m.uniqueOutputPathLocked(job.FileName)
	job.FileName = filepath.Base(job.OutputPath)
	if err := m.persistLocked(); err != nil {
		return Job{}, err
	}
	m.startLocked(id)
	return cloneJob(job), nil
}

func (m *Manager) Delete(id string) (Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return Job{}, ErrNotFound
	}
	if !terminal(job.Status) {
		return Job{}, ErrActiveJob
	}
	out := cloneJob(job)
	if job.Status != StatusCompleted {
		_ = os.Remove(job.OutputPath + ".part")
	}
	delete(m.jobs, id)
	if err := m.persistLocked(); err != nil {
		m.jobs[id] = job
		return Job{}, err
	}
	return out, nil
}

func (m *Manager) startLocked(id string) {
	ctx, cancel := context.WithCancel(context.Background())
	m.cancels[id] = cancel
	go m.run(ctx, id)
}

func (m *Manager) run(ctx context.Context, id string) {
	m.update(id, true, func(job *Job) {
		now := time.Now().UTC()
		job.Status = StatusDownloading
		job.StartedAt = &now
		job.UpdatedAt = now
	})
	defer func() {
		m.mu.Lock()
		delete(m.cancels, id)
		m.mu.Unlock()
	}()

	job, err := m.Get(id)
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, job.URL, nil)
	if err != nil {
		m.fail(id, err)
		return
	}
	req.Header.Set("User-Agent", "mochan-linux-downloads/1.0")

	resp, err := m.client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			m.cancel(id)
			return
		}
		m.fail(id, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		m.fail(id, fmt.Errorf("download failed with HTTP %d", resp.StatusCode))
		return
	}
	if resp.ContentLength >= 0 {
		m.update(id, true, func(job *Job) {
			job.SizeBytes = resp.ContentLength
		})
	}
	m.applyResponseFileName(id, resp)
	job, err = m.Get(id)
	if err != nil {
		return
	}

	tmpPath := job.OutputPath + ".part"
	out, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		m.fail(id, err)
		return
	}

	buf := make([]byte, 64*1024)
	var downloaded int64
	lastTick := time.Now()
	lastBytes := int64(0)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, err := out.Write(buf[:n]); err != nil {
				_ = out.Close()
				_ = os.Remove(tmpPath)
				m.fail(id, err)
				return
			}
			downloaded += int64(n)
			now := time.Now()
			if now.Sub(lastTick) >= 250*time.Millisecond {
				elapsed := now.Sub(lastTick).Seconds()
				speed := int64(float64(downloaded-lastBytes) / elapsed)
				m.update(id, false, func(job *Job) {
					job.Downloaded = downloaded
					job.SpeedBytes = speed
					job.UpdatedAt = now.UTC()
				})
				lastTick = now
				lastBytes = downloaded
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			_ = out.Close()
			_ = os.Remove(tmpPath)
			if ctx.Err() != nil {
				m.cancel(id)
				return
			}
			m.fail(id, readErr)
			return
		}
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmpPath)
		m.fail(id, err)
		return
	}
	if ctx.Err() != nil {
		_ = os.Remove(tmpPath)
		m.cancel(id)
		return
	}
	if err := os.Rename(tmpPath, job.OutputPath); err != nil {
		_ = os.Remove(tmpPath)
		m.fail(id, err)
		return
	}
	m.update(id, true, func(job *Job) {
		now := time.Now().UTC()
		job.Status = StatusCompleted
		job.Downloaded = downloaded
		if job.SizeBytes < 0 {
			job.SizeBytes = downloaded
		}
		job.SpeedBytes = 0
		job.Error = ""
		job.CompletedAt = &now
		job.UpdatedAt = now
	})
}

func (m *Manager) fail(id string, err error) {
	m.update(id, true, func(job *Job) {
		now := time.Now().UTC()
		job.Status = StatusFailed
		job.SpeedBytes = 0
		job.Error = err.Error()
		job.UpdatedAt = now
	})
}

func (m *Manager) cancel(id string) {
	m.update(id, true, func(job *Job) {
		now := time.Now().UTC()
		job.Status = StatusCanceled
		job.SpeedBytes = 0
		job.Error = "canceled"
		job.UpdatedAt = now
	})
}

func (m *Manager) update(id string, persist bool, fn func(*Job)) {
	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok {
		return
	}
	fn(job)
	if persist {
		_ = m.persistLocked()
	}
}

func (m *Manager) applyResponseFileName(id string, resp *http.Response) {
	responseName := fileNameFromContentDisposition(resp.Header.Get("Content-Disposition"))
	if responseName == "" {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	job, ok := m.jobs[id]
	if !ok || !job.PreferResponseFileName || terminal(job.Status) {
		return
	}
	outputPath := m.uniqueOutputPathForJobLocked(responseName, id)
	job.FileName = filepath.Base(outputPath)
	job.OutputPath = outputPath
	job.UpdatedAt = time.Now().UTC()
	_ = m.persistLocked()
}

func (m *Manager) load() error {
	buf, err := os.ReadFile(m.indexPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	var idx indexFile
	if err := json.Unmarshal(buf, &idx); err != nil {
		return err
	}
	now := time.Now().UTC()
	changed := false
	for _, persisted := range idx.Jobs {
		job := persisted
		if job.Status == StatusDownloading || job.Status == StatusQueued {
			job.Status = StatusFailed
			job.SpeedBytes = 0
			job.Error = "server restarted before download completed"
			job.UpdatedAt = now
			changed = true
		}
		m.jobs[job.ID] = &job
	}
	if changed {
		return m.persistLocked()
	}
	return nil
}

func (m *Manager) persistLocked() error {
	jobs := make([]Job, 0, len(m.jobs))
	for _, job := range m.jobs {
		jobs = append(jobs, cloneJob(job))
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].ID < jobs[j].ID })
	buf, err := json.MarshalIndent(indexFile{Version: 1, Jobs: jobs}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(m.base, ".index-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()
	if _, err := tmp.Write(buf); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o640); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, m.indexPath)
}

func (m *Manager) uniqueOutputPathLocked(fileName string) string {
	return m.uniqueOutputPathForJobLocked(fileName, "")
}

func (m *Manager) uniqueOutputPathForJobLocked(fileName, ignoreID string) string {
	base := sanitizeFileName(fileName)
	if base == "" || !safeBaseName(base) {
		base = "download"
	}
	candidate := filepath.Join(m.filesDir, base)
	if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) && !m.outputPathInUseLocked(candidate, ignoreID) {
		return candidate
	}
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)
	for i := 1; ; i++ {
		name := fmt.Sprintf("%s-%d%s", stem, i, ext)
		candidate = filepath.Join(m.filesDir, name)
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) && !m.outputPathInUseLocked(candidate, ignoreID) {
			return candidate
		}
	}
}

func (m *Manager) outputPathInUseLocked(path, ignoreID string) bool {
	for id, job := range m.jobs {
		if id == ignoreID {
			continue
		}
		if job.OutputPath == path {
			return true
		}
	}
	return false
}

type Handler struct {
	manager *Manager
	audit   *audit.Logger
}

func NewHandler(manager *Manager, auditLog *audit.Logger) *Handler {
	return &Handler{manager: manager, audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/", h.list)
	r.Post("/", h.create)
	r.Get("/{id}", h.get)
	r.Post("/{id}/cancel", h.cancel)
	r.Post("/{id}/retry", h.retry)
	r.Delete("/{id}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"downloads": h.manager.List()})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL      string `json:"url"`
		FileName string `json:"file_name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 16*1024)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	job, err := h.manager.Create(body.URL, body.FileName)
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "download.create", map[string]any{"id": job.ID, "url": job.URL, "file_name": job.FileName})
	writeJSON(w, http.StatusAccepted, job)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	job, err := h.manager.Get(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *Handler) cancel(w http.ResponseWriter, r *http.Request) {
	job, err := h.manager.Cancel(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "download.cancel", map[string]any{"id": job.ID})
	writeJSON(w, http.StatusOK, job)
}

func (h *Handler) retry(w http.ResponseWriter, r *http.Request) {
	job, err := h.manager.Retry(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "download.retry", map[string]any{"id": job.ID, "url": job.URL})
	writeJSON(w, http.StatusAccepted, job)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	job, err := h.manager.Delete(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	h.auditEvent(r, "download.delete", map[string]any{"id": job.ID, "status": job.Status})
	writeJSON(w, http.StatusOK, job)
}

func (h *Handler) auditEvent(r *http.Request, eventType string, detail map[string]any) {
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
		Detail:  detail,
		Outcome: "ok",
	})
}

func newClient() *http.Client {
	return netguard.NewHTTPClient(0, 5)
}

func parseTargetURL(raw string) (*url.URL, error) {
	u, err := netguard.ParseHTTPURL(raw)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	return u, nil
}

func fileNameFromURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	name := pathBase(u.EscapedPath())
	if decoded, err := url.PathUnescape(name); err == nil {
		name = decoded
	}
	return name
}

func fileNameFromContentDisposition(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	_, params, err := mime.ParseMediaType(value)
	if err != nil {
		return ""
	}
	return sanitizeFileName(params["filename"])
}

func pathBase(path string) string {
	path = strings.TrimRight(path, "/")
	if path == "" {
		return ""
	}
	i := strings.LastIndexByte(path, '/')
	if i >= 0 {
		return path[i+1:]
	}
	return path
}

// safeBaseName reports whether name is a single path component safe to join
// onto filesDir. It is a defense-in-depth check on top of sanitizeFileName.
func safeBaseName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	if strings.ContainsAny(name, "/\\\x00") {
		return false
	}
	return name == filepath.Base(name)
}

func sanitizeFileName(name string) string {
	name = strings.TrimSpace(filepath.Base(name))
	if name == "." || name == ".." || name == string(filepath.Separator) {
		return ""
	}
	name = strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', 0:
			return -1
		default:
			return r
		}
	}, name)
	if name == "." || name == ".." {
		return ""
	}
	if len(name) > 180 {
		ext := filepath.Ext(name)
		stem := strings.TrimSuffix(name, ext)
		if len(ext) > 40 {
			ext = ""
		}
		maxStem := 180 - len(ext)
		if maxStem < 1 {
			maxStem = 1
		}
		if len(stem) > maxStem {
			stem = stem[:maxStem]
		}
		name = stem + ext
	}
	return name
}

func newID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func terminal(status Status) bool {
	return status == StatusCompleted || status == StatusFailed || status == StatusCanceled
}

func cloneJob(job *Job) Job {
	if job == nil {
		return Job{}
	}
	out := *job
	return out
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidURL):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, ErrNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, ErrActiveJob), errors.Is(err, ErrTerminalJob), errors.Is(err, ErrRetryNotAllowed):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
