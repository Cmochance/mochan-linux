package downloads

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
)

func TestManagerCompletesDownload(t *testing.T) {
	payload := []byte("server-side download payload")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()

	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	job, err := m.Create(upstream.URL+"/payload.txt", "")
	if err != nil {
		t.Fatal(err)
	}
	job = waitJob(t, m, job.ID, func(j Job) bool { return j.Status == StatusCompleted })

	if job.Downloaded != int64(len(payload)) {
		t.Fatalf("downloaded = %d, want %d", job.Downloaded, len(payload))
	}
	got, err := os.ReadFile(job.OutputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("output content mismatch: %q", got)
	}
}

func TestManagerRejectsUnsafeURLs(t *testing.T) {
	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	for _, raw := range []string{
		"file:///tmp/example",
		"http://user:pass@example.com/file",
		"http://169.254.169.254/latest/meta-data",
		"http://metadata.google.internal/computeMetadata/v1",
	} {
		if _, err := m.Create(raw, ""); !errors.Is(err, ErrInvalidURL) {
			t.Fatalf("Create(%q) error = %v, want ErrInvalidURL", raw, err)
		}
	}
}

func TestManagerFailedDownload(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	defer upstream.Close()

	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	job, err := m.Create(upstream.URL+"/broken.bin", "")
	if err != nil {
		t.Fatal(err)
	}
	job = waitJob(t, m, job.ID, func(j Job) bool { return terminal(j.Status) })

	if job.Status != StatusFailed {
		t.Fatalf("status = %s, want failed", job.Status)
	}
	if job.Error == "" {
		t.Fatal("expected failure error")
	}
}

func TestManagerCancelDownload(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		flusher, _ := w.(http.Flusher)
		for i := 0; i < 200; i++ {
			if _, err := w.Write(bytes.Repeat([]byte("x"), 1024)); err != nil {
				return
			}
			if flusher != nil {
				flusher.Flush()
			}
			time.Sleep(5 * time.Millisecond)
		}
	}))
	defer upstream.Close()

	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	job, err := m.Create(upstream.URL+"/slow.bin", "")
	if err != nil {
		t.Fatal(err)
	}
	waitJob(t, m, job.ID, func(j Job) bool { return j.Status == StatusDownloading })
	if _, err := m.Cancel(job.ID); err != nil {
		t.Fatal(err)
	}
	job = waitJob(t, m, job.ID, func(j Job) bool { return terminal(j.Status) })

	if job.Status != StatusCanceled {
		t.Fatalf("status = %s, want canceled", job.Status)
	}
	if _, err := os.Stat(job.OutputPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("final output exists after cancel: %v", err)
	}
}

func TestManagerPersistsCompletedJobs(t *testing.T) {
	payload := []byte("persistent download")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()

	base := t.TempDir()
	m, err := NewManager(base)
	if err != nil {
		t.Fatal(err)
	}
	job, err := m.Create(upstream.URL+"/persist.txt", "")
	if err != nil {
		t.Fatal(err)
	}
	job = waitJob(t, m, job.ID, func(j Job) bool { return j.Status == StatusCompleted })

	reloaded, err := NewManager(base)
	if err != nil {
		t.Fatal(err)
	}
	got, err := reloaded.Get(job.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != StatusCompleted || got.OutputPath != job.OutputPath {
		t.Fatalf("reloaded job = %+v, want completed output %q", got, job.OutputPath)
	}
}

func TestHandlerRoutesAndAudit(t *testing.T) {
	payload := []byte("via handler")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()

	m, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	auditLog, err := audit.New(t.TempDir() + "/audit.log")
	if err != nil {
		t.Fatal(err)
	}
	defer auditLog.Close()

	router := chi.NewRouter()
	NewHandler(m, auditLog).Mount(router)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"url":`+quote(upstream.URL+"/handler.txt")+`}`))
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("create status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var created Job
	if err := json.NewDecoder(rec.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	waitJob(t, m, created.ID, func(j Job) bool { return j.Status == StatusCompleted })

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/", nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list status = %d, body = %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodDelete, "/"+created.ID, nil)
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete status = %d, body = %s", rec.Code, rec.Body.String())
	}

	auditBytes, err := os.ReadFile(auditLog.Path())
	if err != nil {
		t.Fatal(err)
	}
	auditText := string(auditBytes)
	if !strings.Contains(auditText, `"type":"download.create"`) || !strings.Contains(auditText, `"type":"download.delete"`) {
		t.Fatalf("audit log missing download events: %s", auditText)
	}
}

func waitJob(t *testing.T, m *Manager, id string, pred func(Job) bool) Job {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	var last Job
	for time.Now().Before(deadline) {
		job, err := m.Get(id)
		if err != nil {
			t.Fatal(err)
		}
		last = job
		if pred(job) {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for job %s; last = %+v", id, last)
	return Job{}
}

func quote(s string) string {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(s); err != nil {
		panic(err)
	}
	out, err := io.ReadAll(&buf)
	if err != nil {
		panic(err)
	}
	return strings.TrimSpace(string(out))
}
