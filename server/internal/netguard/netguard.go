// Package netguard builds HTTP clients that intentionally run from the
// mochan-linux host network while blocking cloud metadata and link-local
// targets.
package netguard

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"
)

// allowPrivate, when true, lets the guarded client reach RFC1918, loopback,
// and IPv6 unique-local destinations. Disabled by default; enable by setting
// MOCHAN_PROXY_ALLOW_PRIVATE=1 for development against local services.
var allowPrivate = os.Getenv("MOCHAN_PROXY_ALLOW_PRIVATE") == "1"

// SetAllowPrivate toggles private-range access at runtime and returns a
// restore function. Intended for tests that need to dial httptest servers on
// loopback; do not use in production code.
func SetAllowPrivate(v bool) func() {
	prev := allowPrivate
	allowPrivate = v
	return func() { allowPrivate = prev }
}

// NewHTTPClient returns an HTTP client with guarded dialing and redirect
// validation. A zero timeout leaves the client without an overall deadline.
func NewHTTPClient(timeout time.Duration, maxRedirects int) *http.Client {
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           GuardedDialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          16,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if maxRedirects >= 0 && len(via) >= maxRedirects {
				return errors.New("too many redirects")
			}
			return ValidateHTTPURL(req.URL)
		},
	}
}

// ParseHTTPURL validates a user-supplied HTTP(S) URL and strips fragment and
// credentials before callers send or store it.
func ParseHTTPURL(raw string) (*url.URL, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, errors.New("missing url")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, fmt.Errorf("bad url: %w", err)
	}
	if err := ValidateHTTPURL(u); err != nil {
		return nil, err
	}
	u.Fragment = ""
	u.User = nil
	return u, nil
}

// ValidateHTTPURL enforces the common target restrictions for server-side
// network features.
func ValidateHTTPURL(u *url.URL) error {
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
	if addr, err := netip.ParseAddr(host); err == nil && BlockedAddr(addr) {
		return errors.New("target address is blocked")
	}
	return nil
}

// GuardedDialContext resolves the target host and skips blocked addresses
// before dialing.
func GuardedDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}

	addrs, err := ResolveHost(ctx, host)
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
		if BlockedAddr(addr) {
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

// ResolveHost returns normalized IP addresses for a host.
func ResolveHost(ctx context.Context, host string) ([]netip.Addr, error) {
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

// BlockedAddr blocks link-local ranges, RFC1918 / loopback / unique-local
// space, and common cloud metadata endpoints. Set MOCHAN_PROXY_ALLOW_PRIVATE=1
// to opt out of the private-range block (cloud metadata stays blocked).
func BlockedAddr(addr netip.Addr) bool {
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

	if !allowPrivate {
		if addr.IsLoopback() || addr.IsPrivate() {
			return true
		}
		// IPv6 unique-local (fc00::/7) is not covered by IsPrivate.
		if addr.Is6() && len(addr.AsSlice()) > 0 && addr.AsSlice()[0]&0xfe == 0xfc {
			return true
		}
	}
	return false
}
