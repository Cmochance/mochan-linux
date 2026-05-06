package apitester

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

func TestMain(m *testing.M) {
	restore := netguard.SetAllowPrivate(true)
	code := m.Run()
	restore()
	os.Exit(code)
}

func TestExecuteGET(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if got := r.Header.Get("X-Test"); got != "ok" {
			t.Fatalf("X-Test = %q, want ok", got)
		}
		w.Header().Set("X-Upstream", "yes")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	resp, target, outcome, err := Execute(httptest.NewRequest(http.MethodPost, "/run", nil), RunRequest{
		Method: "GET",
		URL:    upstream.URL + "/resource",
		Headers: []Header{
			{Key: "X-Test", Value: "ok", Enabled: true},
			{Key: "X-Disabled", Value: "no", Enabled: false},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if outcome != "ok" || target.Host == "" {
		t.Fatalf("outcome=%q target=%v", outcome, target)
	}
	if resp.Status != http.StatusOK || resp.StatusText != "OK" {
		t.Fatalf("response status = %d %q", resp.Status, resp.StatusText)
	}
	if resp.Headers["X-Upstream"] != "yes" {
		t.Fatalf("headers = %#v", resp.Headers)
	}
	if resp.Body != `{"ok":true}` {
		t.Fatalf("body = %q", resp.Body)
	}
}

func TestExecutePOSTBody(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(r.Body)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"method": r.Method,
			"body":   buf.String(),
		})
	}))
	defer upstream.Close()

	resp, _, _, err := Execute(httptest.NewRequest(http.MethodPost, "/run", nil), RunRequest{
		Method:  "post",
		URL:     upstream.URL,
		Headers: []Header{{Key: "Content-Type", Value: "application/json", Enabled: true}},
		Body:    `{"name":"mochan"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]string
	if err := json.Unmarshal([]byte(resp.Body), &got); err != nil {
		t.Fatal(err)
	}
	if got["method"] != "POST" || got["body"] != `{"name":"mochan"}` {
		t.Fatalf("body = %#v", got)
	}
}

func TestExecuteRejectsUnsafeInput(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/run", nil)
	cases := []RunRequest{
		{Method: "TRACE", URL: "http://127.0.0.1/"},
		{Method: "GET", URL: "file:///tmp/test"},
		{Method: "GET", URL: "http://169.254.169.254/latest/meta-data"},
		{Method: "GET", URL: "http://metadata.google.internal/computeMetadata/v1"},
		{Method: "GET", URL: "http://127.0.0.1/", Headers: []Header{{Key: "Host", Value: "example.com", Enabled: true}}},
		{Method: "GET", URL: "http://127.0.0.1/", Headers: []Header{{Key: "X-Bad\nName", Value: "x", Enabled: true}}},
	}
	for _, tc := range cases {
		if _, _, outcome, err := Execute(req, tc); err == nil || outcome != "deny" {
			t.Fatalf("Execute(%+v) outcome=%q err=%v, want deny error", tc, outcome, err)
		}
	}
}

func TestExecuteTruncatesLargeResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(bytes.Repeat([]byte("a"), maxResponseBytes+64))
	}))
	defer upstream.Close()

	resp, _, _, err := Execute(httptest.NewRequest(http.MethodPost, "/run", nil), RunRequest{
		Method: "GET",
		URL:    upstream.URL,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !resp.Truncated {
		t.Fatal("expected truncated response")
	}
	if !strings.Contains(resp.Body, "response truncated") {
		t.Fatalf("missing truncation marker")
	}
}

func TestExecuteNetworkErrorReturnsResult(t *testing.T) {
	resp, _, outcome, err := Execute(httptest.NewRequest(http.MethodPost, "/run", nil), RunRequest{
		Method: "GET",
		URL:    "http://127.0.0.1:1/unreachable",
	})
	if err == nil {
		t.Fatal("expected network error")
	}
	if outcome != "error" || resp.Error == "" {
		t.Fatalf("outcome=%q response=%+v", outcome, resp)
	}
}

func TestHandlerRoutesAndAudit(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	}))
	defer upstream.Close()

	auditLog, err := audit.New(t.TempDir() + "/audit.log")
	if err != nil {
		t.Fatal(err)
	}
	defer auditLog.Close()

	router := chi.NewRouter()
	New(auditLog).Mount(router)

	body := `{"method":"GET","url":` + quote(upstream.URL+"/path?secret=hidden") + `}`
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/run", strings.NewReader(body)))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	auditBytes, err := os.ReadFile(auditLog.Path())
	if err != nil {
		t.Fatal(err)
	}
	auditText := string(auditBytes)
	if !strings.Contains(auditText, `"type":"apitester.run"`) {
		t.Fatalf("missing audit event: %s", auditText)
	}
	if strings.Contains(auditText, "secret=hidden") {
		t.Fatalf("audit log leaked query string: %s", auditText)
	}
}

func TestHandlerRejectsBadJSON(t *testing.T) {
	router := chi.NewRouter()
	New(nil).Mount(router)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/run", strings.NewReader("{")))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}

func quote(s string) string {
	buf, err := json.Marshal(s)
	if err != nil {
		panic(err)
	}
	return string(buf)
}

func TestNormalizeTimeout(t *testing.T) {
	if got := normalizeTimeout(0); got != defaultTimeoutMS {
		t.Fatalf("default timeout = %d", got)
	}
	if got := normalizeTimeout(10); got != minTimeoutMS {
		t.Fatalf("min timeout = %d", got)
	}
	if got := normalizeTimeout(60000); got != maxTimeoutMS {
		t.Fatalf("max timeout = %d", got)
	}
}

func TestBuildHeadersSkipsDisabledAndEmpty(t *testing.T) {
	headers, err := buildHeaders([]Header{
		{Key: "", Value: "ignored", Enabled: true},
		{Key: "X-Off", Value: "ignored", Enabled: false},
		{Key: "X-On", Value: "yes", Enabled: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := headers.Get("X-On"); got != "yes" {
		t.Fatalf("X-On = %q", got)
	}
	if got := headers.Get("X-Off"); got != "" {
		t.Fatalf("X-Off = %q", got)
	}
	if _, _, outcome, err := Execute(httptest.NewRequest(http.MethodPost, "/run", nil), RunRequest{Method: "POST", URL: "http://127.0.0.1/", Body: strings.Repeat("x", maxRequestBytes+1)}); err == nil || outcome != "deny" {
		t.Fatalf("oversized POST body outcome=%q err=%v, want deny error", outcome, err)
	}
}
