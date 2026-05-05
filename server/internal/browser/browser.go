package browser

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

const (
	maxResponseBytes = 10 << 20
	proxyPath        = "/api/browser/proxy"
)

// Handler fetches HTTP(S) pages from the server host and returns them through
// the authenticated mochan-linux origin.
type Handler struct {
	client *http.Client
}

func New() *Handler {
	return &Handler{client: newClient()}
}

func (h *Handler) Mount(r chi.Router) {
	r.Get("/proxy", h.proxy)
}

func newClient() *http.Client {
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           guardedDialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          16,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   15 * time.Second,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("too many redirects")
			}
			return validateTargetURL(req.URL)
		},
	}
}

func (h *Handler) proxy(w http.ResponseWriter, r *http.Request) {
	target, err := parseTargetURL(r.URL.Query().Get("url"))
	if err != nil {
		writeProxyError(w, http.StatusBadRequest, err)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		writeProxyError(w, http.StatusBadRequest, err)
		return
	}
	copyRequestHeader(req.Header, r.Header, "Accept")
	copyRequestHeader(req.Header, r.Header, "Accept-Language")
	req.Header.Set("User-Agent", "mochan-linux-browser/1.0")

	resp, err := h.client.Do(req)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, err)
		return
	}
	defer resp.Body.Close()

	body, err := readLimited(resp.Body)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, err)
		return
	}

	contentType := resp.Header.Get("content-type")
	if contentType == "" {
		contentType = http.DetectContentType(body)
	}
	mediaType, _, _ := mime.ParseMediaType(contentType)
	if mediaType == "" {
		mediaType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	}

	switch mediaType {
	case "text/html", "application/xhtml+xml":
		body = rewriteHTML(body, resp.Request.URL)
		contentType = "text/html; charset=utf-8"
		setBrowserCSP(w)
	case "text/css":
		body = rewriteCSS(body, resp.Request.URL)
		contentType = "text/css; charset=utf-8"
	default:
		if strings.HasPrefix(mediaType, "text/") {
			contentType = mediaType + "; charset=utf-8"
		}
	}

	w.Header().Set("content-type", contentType)
	w.Header().Set("x-content-type-options", "nosniff")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(body)
}

func parseTargetURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("missing url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("bad url: %w", err)
	}
	if err := validateTargetURL(u); err != nil {
		return nil, err
	}
	u.Fragment = ""
	u.User = nil
	return u, nil
}

func validateTargetURL(u *url.URL) error {
	if u == nil {
		return errors.New("missing url")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return errors.New("only http and https urls are supported")
	}
	if u.Host == "" || u.Hostname() == "" {
		return errors.New("url host is required")
	}
	if u.User != nil {
		return errors.New("url credentials are not allowed")
	}
	host := strings.Trim(strings.ToLower(u.Hostname()), "[]")
	if host == "metadata.google.internal" {
		return errors.New("cloud metadata hosts are blocked")
	}
	return nil
}

func guardedDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}

	addrs, err := resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(addrs) == 0 {
		return nil, fmt.Errorf("no addresses for %s", host)
	}

	var blocked []netip.Addr
	var lastErr error
	dialer := net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	for _, addr := range addrs {
		if blockedAddr(addr) {
			blocked = append(blocked, addr)
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(addr.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if len(blocked) > 0 {
		return nil, fmt.Errorf("blocked target address %s", blocked[0])
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no usable addresses for %s", host)
}

func resolveHost(ctx context.Context, host string) ([]netip.Addr, error) {
	if addr, err := netip.ParseAddr(strings.Trim(host, "[]")); err == nil {
		return []netip.Addr{addr.Unmap()}, nil
	}
	addrs, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	for i := range addrs {
		addrs[i] = addrs[i].Unmap()
	}
	return addrs, nil
}

func blockedAddr(addr netip.Addr) bool {
	addr = addr.Unmap()
	if !addr.IsValid() {
		return true
	}
	if addr.IsUnspecified() || addr.IsMulticast() || addr.IsLinkLocalMulticast() || addr.IsLinkLocalUnicast() {
		return true
	}

	blocked := []string{
		"169.254.169.254", // AWS, GCP, Azure metadata convention.
		"100.100.100.200", // Alibaba Cloud metadata.
		"fd00:ec2::254",   // AWS IPv6 metadata.
	}
	for _, raw := range blocked {
		if parsed, err := netip.ParseAddr(raw); err == nil && addr == parsed {
			return true
		}
	}
	return false
}

func copyRequestHeader(dst, src http.Header, key string) {
	if value := src.Get(key); value != "" {
		dst.Set(key, value)
	}
}

func readLimited(r io.Reader) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(r, maxResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxResponseBytes {
		return nil, fmt.Errorf("response too large: limit is %d bytes", maxResponseBytes)
	}
	return body, nil
}

func writeProxyError(w http.ResponseWriter, status int, err error) {
	setBrowserCSP(w)
	w.Header().Set("content-type", "text/html; charset=utf-8")
	w.Header().Set("x-content-type-options", "nosniff")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>Browser Error</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#2f2f2f"><h1 style="font-size:20px;margin:0 0 12px">页面加载失败</h1><p style="line-height:1.6">%s</p></body></html>`, html.EscapeString(err.Error()))
}

func setBrowserCSP(w http.ResponseWriter) {
	w.Header().Set("content-security-policy", "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'self' data: blob:; script-src 'none'; connect-src 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'")
}

var (
	attrURLPattern     = regexp.MustCompile(`(?i)\b(src|href|action)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	srcsetURLPattern   = regexp.MustCompile(`(?i)\bsrcset\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	cssURLPattern      = regexp.MustCompile(`(?i)url\(\s*("[^"]*"|'[^']*'|[^'")]+)\s*\)`)
	metaRefreshPattern = regexp.MustCompile(`(?i)\bcontent\s*=\s*("[^"]*"|'[^']*')`)
)

func rewriteHTML(body []byte, base *url.URL) []byte {
	out := attrURLPattern.ReplaceAllStringFunc(string(body), func(match string) string {
		parts := attrURLPattern.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		quote, value := splitQuotedValue(parts[2])
		return parts[1] + "=" + quote + html.EscapeString(rewriteResourceURL(value, base)) + quote
	})
	out = srcsetURLPattern.ReplaceAllStringFunc(out, func(match string) string {
		parts := srcsetURLPattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		quote, value := splitQuotedValue(parts[1])
		return "srcset=" + quote + html.EscapeString(rewriteSrcset(value, base)) + quote
	})
	out = metaRefreshPattern.ReplaceAllStringFunc(out, func(match string) string {
		parts := metaRefreshPattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		quote, value := splitQuotedValue(parts[1])
		lower := strings.ToLower(value)
		idx := strings.Index(lower, "url=")
		if idx < 0 {
			return match
		}
		prefix := value[:idx+4]
		target := strings.TrimSpace(value[idx+4:])
		return "content=" + quote + html.EscapeString(prefix+rewriteResourceURL(target, base)) + quote
	})
	return rewriteCSS([]byte(out), base)
}

func rewriteCSS(body []byte, base *url.URL) []byte {
	out := cssURLPattern.ReplaceAllStringFunc(string(body), func(match string) string {
		parts := cssURLPattern.FindStringSubmatch(match)
		if len(parts) != 2 {
			return match
		}
		quote, value := splitQuotedValue(parts[1])
		if quote == `"` || quote == `'` {
			return "url(" + quote + rewriteResourceURL(value, base) + quote + ")"
		}
		return "url(" + rewriteResourceURL(value, base) + ")"
	})
	return []byte(out)
}

func splitQuotedValue(raw string) (quote string, value string) {
	if len(raw) >= 2 {
		first := raw[0]
		last := raw[len(raw)-1]
		if (first == '"' || first == '\'') && last == first {
			return string(first), raw[1 : len(raw)-1]
		}
	}
	return `"`, raw
}

func rewriteSrcset(raw string, base *url.URL) string {
	candidates := strings.Split(raw, ",")
	for i, candidate := range candidates {
		fields := strings.Fields(strings.TrimSpace(candidate))
		if len(fields) == 0 {
			continue
		}
		fields[0] = rewriteResourceURL(fields[0], base)
		candidates[i] = strings.Join(fields, " ")
	}
	return strings.Join(candidates, ", ")
}

func rewriteResourceURL(raw string, base *url.URL) string {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(value, "#") {
		return raw
	}
	lower := strings.ToLower(value)
	for _, prefix := range []string{"data:", "blob:", "javascript:", "mailto:", "tel:", "about:", "ink:"} {
		if strings.HasPrefix(lower, prefix) {
			return raw
		}
	}
	ref, err := url.Parse(value)
	if err != nil {
		return raw
	}
	resolved := base.ResolveReference(ref)
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return raw
	}
	resolved.Fragment = ""
	resolved.User = nil
	return proxyPath + "?url=" + url.QueryEscape(resolved.String())
}
