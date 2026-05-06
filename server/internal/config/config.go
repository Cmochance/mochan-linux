package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Listen          string
	Username        string
	Email           string
	PasswordHash    string
	JWTSecret       []byte
	TokenTTL        time.Duration
	DataDir         string
	DBPath          string
	ShellUser       string
	ResendAPIKey    string
	ResendFromEmail string
	InviteTTL       time.Duration
}

func Load() (*Config, error) {
	c := &Config{
		Listen:          envOr("MOCHAN_LISTEN", "127.0.0.1:38421"),
		Username:        envOr("MOCHAN_USERNAME", "admin"),
		Email:           os.Getenv("MOCHAN_EMAIL"),
		PasswordHash:    os.Getenv("MOCHAN_PASSWORD_HASH"),
		DataDir:         envOr("MOCHAN_DATA_DIR", "/var/lib/mochan"),
		ShellUser:       os.Getenv("MOCHAN_SHELL_USER"),
		ResendAPIKey:    os.Getenv("MOCHAN_RESEND_API_KEY"),
		ResendFromEmail: envOr("MOCHAN_RESEND_FROM_EMAIL", "mochan-linux <noreply@auth.mochance.xyz>"),
	}
	c.DBPath = envOr("MOCHAN_DB_PATH", "")
	if c.DBPath == "" {
		c.DBPath = c.DataDir + "/mochan.db"
	}

	secret := os.Getenv("MOCHAN_JWT_SECRET")
	if secret == "" {
		return nil, errors.New("MOCHAN_JWT_SECRET is required")
	}
	c.JWTSecret = []byte(secret)

	if c.PasswordHash == "" {
		return nil, errors.New("MOCHAN_PASSWORD_HASH is required (run `mochan hash-password` to generate)")
	}

	ttlStr := envOr("MOCHAN_TOKEN_TTL", "24h")
	ttl, err := time.ParseDuration(ttlStr)
	if err != nil {
		return nil, fmt.Errorf("invalid MOCHAN_TOKEN_TTL %q: %w", ttlStr, err)
	}
	c.TokenTTL = ttl

	inviteTTLStr := envOr("MOCHAN_INVITE_TTL", "168h")
	inviteTTL, err := time.ParseDuration(inviteTTLStr)
	if err != nil {
		return nil, fmt.Errorf("invalid MOCHAN_INVITE_TTL %q: %w", inviteTTLStr, err)
	}
	c.InviteTTL = inviteTTL

	if minLen, _ := strconv.Atoi(envOr("MOCHAN_MIN_SECRET_LEN", "32")); len(c.JWTSecret) < minLen {
		return nil, fmt.Errorf("MOCHAN_JWT_SECRET must be at least %d bytes", minLen)
	}
	if err := checkSecretEntropy(c.JWTSecret); err != nil {
		return nil, fmt.Errorf("MOCHAN_JWT_SECRET %w", err)
	}

	return c, nil
}

// checkSecretEntropy rejects obviously weak secrets that happen to satisfy
// the length requirement (e.g. "a" repeated 32 times). It is a backstop, not
// a substitute for a strong random source — generate secrets via
// `openssl rand -base64 48` or equivalent.
func checkSecretEntropy(secret []byte) error {
	const minDistinct = 12
	distinct := make(map[byte]struct{}, len(secret))
	for _, b := range secret {
		distinct[b] = struct{}{}
	}
	if len(distinct) < minDistinct {
		return fmt.Errorf("has %d distinct bytes, need at least %d (looks like a repeated/low-entropy value)", len(distinct), minDistinct)
	}
	return nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
