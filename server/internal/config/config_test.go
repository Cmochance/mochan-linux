package config

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func TestCheckSecretEntropy(t *testing.T) {
	cases := []struct {
		name    string
		secret  string
		wantErr bool
	}{
		{"all same byte", strings.Repeat("a", 32), true},
		{"two-char alphabet", strings.Repeat("ab", 16), true},
		{"digits only short alphabet", strings.Repeat("0123456789", 4), true},
		{"changeme repeated", strings.Repeat("changeme", 4), true},
		{"random base64", randomBase64(t, 32), false},
		{"high-entropy ascii", "Tr0ub4dor&3-aFmpZxQv7Lk!9NqRyW%c", false},
	}
	for _, tc := range cases {
		err := checkSecretEntropy([]byte(tc.secret))
		if tc.wantErr && err == nil {
			t.Errorf("checkSecretEntropy(%q) = nil, want error", tc.name)
		}
		if !tc.wantErr && err != nil {
			t.Errorf("checkSecretEntropy(%q) = %v, want nil", tc.name, err)
		}
	}
}

func randomBase64(t *testing.T, n int) string {
	t.Helper()
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buf)
}
