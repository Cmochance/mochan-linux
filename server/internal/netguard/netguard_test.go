package netguard

import (
	"net/netip"
	"net/url"
	"testing"
)

func TestBlockedAddrDefault(t *testing.T) {
	allowPrivate = false

	cases := []struct {
		addr    string
		blocked bool
	}{
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"2606:4700:4700::1111", false},

		{"127.0.0.1", true},
		{"127.5.5.5", true},
		{"::1", true},
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"172.32.0.1", false},
		{"192.168.1.1", true},
		{"169.254.1.1", true},
		{"169.254.169.254", true},
		{"100.100.100.200", true},
		{"fd00:ec2::254", true},
		{"fc00::1", true},
		{"fd12:3456::1", true},
		{"fe80::1", true},
		{"224.0.0.1", true},
		{"0.0.0.0", true},
	}
	for _, tc := range cases {
		addr, err := netip.ParseAddr(tc.addr)
		if err != nil {
			t.Fatalf("parse %s: %v", tc.addr, err)
		}
		if got := BlockedAddr(addr); got != tc.blocked {
			t.Errorf("BlockedAddr(%s) = %v, want %v", tc.addr, got, tc.blocked)
		}
	}
}

func TestBlockedAddrAllowPrivate(t *testing.T) {
	prev := allowPrivate
	allowPrivate = true
	t.Cleanup(func() { allowPrivate = prev })

	allowed := []string{"127.0.0.1", "10.0.0.1", "192.168.1.1", "fc00::1", "::1"}
	for _, raw := range allowed {
		addr, err := netip.ParseAddr(raw)
		if err != nil {
			t.Fatalf("parse %s: %v", raw, err)
		}
		if BlockedAddr(addr) {
			t.Errorf("BlockedAddr(%s) blocked under allowPrivate, want allowed", raw)
		}
	}

	// Cloud metadata stays blocked even with allowPrivate, because the explicit
	// block list runs before the private-range gate.
	stillBlocked := []string{"169.254.169.254", "fd00:ec2::254"}
	for _, raw := range stillBlocked {
		addr, err := netip.ParseAddr(raw)
		if err != nil {
			t.Fatalf("parse %s: %v", raw, err)
		}
		if !BlockedAddr(addr) {
			t.Errorf("BlockedAddr(%s) not blocked under allowPrivate, want blocked", raw)
		}
	}
}

func TestValidateHTTPURL(t *testing.T) {
	allowPrivate = false

	cases := []struct {
		raw     string
		wantErr bool
	}{
		{"https://example.com/", false},
		{"http://example.com:8080/x", false},
		{"ftp://example.com/", true},
		{"https:///nohost", true},
		{"https://user:pass@example.com/", true},
		{"https://127.0.0.1/", true},
		{"https://10.0.0.1/", true},
		{"https://169.254.169.254/latest/meta-data", true},
		{"https://[fd00:ec2::254]/", true},
		{"https://[::1]/", true},
		{"https://metadata.google.internal/", true},
	}
	for _, tc := range cases {
		u, err := url.Parse(tc.raw)
		if err != nil {
			if !tc.wantErr {
				t.Errorf("url.Parse(%q) failed: %v", tc.raw, err)
			}
			continue
		}
		err = ValidateHTTPURL(u)
		if tc.wantErr && err == nil {
			t.Errorf("ValidateHTTPURL(%q) = nil, want error", tc.raw)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("ValidateHTTPURL(%q) = %v, want nil", tc.raw, err)
		}
	}
}
