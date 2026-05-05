// Package apitester executes user-authenticated HTTP requests from the
// mochan-linux host network for the API Tester app.
package apitester

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

const (
	maxRequestBytes  = 1 << 20
	maxResponseBytes = 2 << 20
	defaultTimeoutMS = 15000
	minTimeoutMS     = 1000
	maxTimeoutMS     = 30000
)

type Header struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type RunRequest struct {
	Method    string   `json:"method"`
	URL       string   `json:"url"`
	Headers   []Header `json:"headers"`
	Body      string   `json:"body"`
	TimeoutMS int      `json:"timeout_ms"`
}

type RunResponse struct {
	Status     int               `json:"status"`
	StatusText string            `json:"status_text"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	TimeMS     int64             `json:"time_ms"`
	Size       int64             `json:"size"`
	Truncated  bool              `json:"truncated"`
	Error      string            `json:"error,omitempty"`
}

type Handler struct {
	audit *audit.Logger
}

func New(auditLog *audit.Logger) *Handler {
	return &Handler{audit: auditLog}
}

func (h *Handler) Mount(r chi.Router) {
	r.Post("/run", h.run)
}

func (h *Handler) run(w http.ResponseWriter, r *http.Request) {
	var body RunRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBytes+1)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}

	result, target, outcome, err := Execute(r, body)
	if err != nil {
		h.auditRun(r, target, body.Method, outcome, 0, 0, err)
		if outcome == "error" && result.Error != "" {
			writeJSON(w, http.StatusOK, result)
			return
		}
		status := http.StatusBadRequest
		http.Error(w, err.Error(), status)
		return
	}
	h.auditRun(r, target, body.Method, outcome, result.Status, result.TimeMS, nil)
	writeJSON(w, http.StatusOK, result)
}

func Execute(r *http.Request, in RunRequest) (RunResponse, *url.URL, string, error) {
	method, err := validateMethod(in.Method)
	if err != nil {
		return RunResponse{}, nil, "deny", err
	}
	target, err := netguard.ParseHTTPURL(in.URL)
	if err != nil {
		return RunResponse{}, nil, "deny", err
	}
	headers, err := buildHeaders(in.Headers)
	if err != nil {
		return RunResponse{}, target, "deny", err
	}
	timeout := normalizeTimeout(in.TimeoutMS)

	var reqBody io.Reader
	if in.Body != "" && method != http.MethodGet && method != http.MethodHead {
		if len([]byte(in.Body)) > maxRequestBytes {
			return RunResponse{}, target, "deny", fmt.Errorf("request body too large: limit is %d bytes", maxRequestBytes)
		}
		reqBody = strings.NewReader(in.Body)
	}
	req, err := http.NewRequestWithContext(r.Context(), method, target.String(), reqBody)
	if err != nil {
		return RunResponse{}, target, "deny", err
	}
	req.Header = headers
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "mochan-linux-api-tester/1.0")
	}

	client := netguard.NewHTTPClient(time.Duration(timeout)*time.Millisecond, 5)
	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		return RunResponse{
			TimeMS: elapsed,
			Error:  err.Error(),
		}, target, "error", err
	}
	defer resp.Body.Close()

	raw, truncated, err := readResponseBody(resp.Body)
	if err != nil {
		return RunResponse{}, target, "error", err
	}
	size := int64(len(raw))
	if resp.ContentLength >= 0 {
		size = resp.ContentLength
	}
	bodyText := string(raw)
	if truncated {
		bodyText += fmt.Sprintf("\n\n[response truncated at %d bytes]", maxResponseBytes)
	}
	statusText := http.StatusText(resp.StatusCode)
	if statusText == "" {
		statusText = resp.Status
	}
	return RunResponse{
		Status:     resp.StatusCode,
		StatusText: statusText,
		Headers:    flattenHeaders(resp.Header),
		Body:       bodyText,
		TimeMS:     elapsed,
		Size:       size,
		Truncated:  truncated,
	}, target, "ok", nil
}

func validateMethod(method string) (string, error) {
	method = strings.ToUpper(strings.TrimSpace(method))
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch, http.MethodHead, http.MethodOptions:
		return method, nil
	default:
		return "", fmt.Errorf("unsupported method %q", method)
	}
}

func buildHeaders(in []Header) (http.Header, error) {
	if len(in) > 64 {
		return nil, errors.New("too many headers")
	}
	out := http.Header{}
	for _, h := range in {
		if !h.Enabled {
			continue
		}
		key := strings.TrimSpace(h.Key)
		if key == "" {
			continue
		}
		if err := validateHeader(key, h.Value); err != nil {
			return nil, err
		}
		out.Add(key, h.Value)
	}
	return out, nil
}

func validateHeader(key, value string) error {
	lower := strings.ToLower(key)
	blocked := map[string]bool{
		"host":                true,
		"connection":          true,
		"keep-alive":          true,
		"proxy-authenticate":  true,
		"proxy-authorization": true,
		"te":                  true,
		"trailer":             true,
		"transfer-encoding":   true,
		"upgrade":             true,
		"content-length":      true,
	}
	if blocked[lower] {
		return fmt.Errorf("header %q is not allowed", key)
	}
	if strings.ContainsAny(key, " \t\r\n:") {
		return fmt.Errorf("invalid header name %q", key)
	}
	for _, r := range key {
		if r < 33 || r > 126 {
			return fmt.Errorf("invalid header name %q", key)
		}
	}
	if strings.ContainsAny(value, "\r\n") {
		return fmt.Errorf("invalid value for header %q", key)
	}
	if len(value) > 16*1024 {
		return fmt.Errorf("header %q value is too large", key)
	}
	return nil
}

func normalizeTimeout(ms int) int {
	if ms <= 0 {
		return defaultTimeoutMS
	}
	if ms < minTimeoutMS {
		return minTimeoutMS
	}
	if ms > maxTimeoutMS {
		return maxTimeoutMS
	}
	return ms
}

func readResponseBody(r io.Reader) ([]byte, bool, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxResponseBytes+1))
	if err != nil {
		return nil, false, err
	}
	if len(body) > maxResponseBytes {
		return body[:maxResponseBytes], true, nil
	}
	return body, false, nil
}

func flattenHeaders(headers http.Header) map[string]string {
	out := make(map[string]string, len(headers))
	keys := make([]string, 0, len(headers))
	for key := range headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		out[key] = strings.Join(headers.Values(key), ", ")
	}
	return out
}

func (h *Handler) auditRun(r *http.Request, target *url.URL, method, outcome string, status int, timeMS int64, err error) {
	if h.audit == nil {
		return
	}
	detail := map[string]any{
		"method":  strings.ToUpper(strings.TrimSpace(method)),
		"outcome": outcome,
	}
	if target != nil {
		detail["scheme"] = target.Scheme
		detail["host"] = target.Host
		detail["path"] = target.EscapedPath()
	}
	if status > 0 {
		detail["status"] = status
	}
	if timeMS > 0 {
		detail["time_ms"] = timeMS
	}
	if err != nil {
		detail["error"] = err.Error()
	}
	actor := ""
	if c, ok := auth.ClaimsFrom(r.Context()); ok {
		actor = c.Subject
	}
	h.audit.Log(r.Context(), audit.Event{
		Type:    "apitester.run",
		Actor:   actor,
		IP:      audit.ClientIP(r),
		Detail:  detail,
		Outcome: outcome,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
