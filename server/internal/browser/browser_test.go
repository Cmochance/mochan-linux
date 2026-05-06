package browser

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/alysechen/mochan-linux/server/internal/netguard"
)

func TestMain(m *testing.M) {
	restore := netguard.SetAllowPrivate(true)
	code := m.Run()
	restore()
	os.Exit(code)
}

func TestRewriteHTMLRoutesLinksThroughProxy(t *testing.T) {
	base, err := url.Parse("http://127.0.0.1:8080/docs/page.html")
	if err != nil {
		t.Fatal(err)
	}

	input := []byte(`<html><head><link href="/style.css"></head><body><a href="../next?q=1#top">next</a><img src="//cdn.example.test/a.png"><img srcset="/small.png 1x, https://img.example.test/big.png 2x"></body></html>`)
	got := string(rewriteHTML(input, base))

	for _, want := range []string{
		`href="/api/browser/proxy?url=http%3A%2F%2F127.0.0.1%3A8080%2Fstyle.css"`,
		`href="/api/browser/proxy?url=http%3A%2F%2F127.0.0.1%3A8080%2Fnext%3Fq%3D1"`,
		`src="/api/browser/proxy?url=http%3A%2F%2Fcdn.example.test%2Fa.png"`,
		`/api/browser/proxy?url=http%3A%2F%2F127.0.0.1%3A8080%2Fsmall.png 1x`,
		`/api/browser/proxy?url=https%3A%2F%2Fimg.example.test%2Fbig.png 2x`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rewritten html missing %q in %s", want, got)
		}
	}
}

func TestBlockedAddrBlocksMetadataAndLinkLocal(t *testing.T) {
	blocked := []string{"169.254.169.254", "169.254.1.2", "100.100.100.200", "fd00:ec2::254", "fe80::1"}
	for _, raw := range blocked {
		addr := netip.MustParseAddr(raw)
		if !netguard.BlockedAddr(addr) {
			t.Fatalf("expected %s to be blocked", raw)
		}
	}

	allowed := []string{"127.0.0.1", "10.0.0.1", "192.168.1.20", "8.8.8.8", "::1"}
	for _, raw := range allowed {
		addr := netip.MustParseAddr(raw)
		if netguard.BlockedAddr(addr) {
			t.Fatalf("expected %s to be allowed", raw)
		}
	}
}

func TestProxyFetchesFromServerNetwork(t *testing.T) {
	handler := &Handler{client: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"content-type": []string{"text/html; charset=utf-8"}},
			Body:       io.NopCloser(strings.NewReader(`<a href="/inside">inside</a>`)),
			Request:    req,
		}, nil
	})}}

	target := "http://127.0.0.1:38421/start"
	req := httptest.NewRequest(http.MethodGet, "/api/browser/proxy?url="+url.QueryEscape(target), nil)
	rec := httptest.NewRecorder()

	handler.proxy(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `/api/browser/proxy?url=`) {
		t.Fatalf("expected body links to be proxied, got %s", rec.Body.String())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
