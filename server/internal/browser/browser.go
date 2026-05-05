package browser

import (
	"fmt"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/netguard"
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
	return netguard.NewHTTPClient(15*time.Second, 5)
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
	return netguard.ParseHTTPURL(raw)
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
