package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Listen       string
	Username     string
	PasswordHash string
	JWTSecret    []byte
	TokenTTL     time.Duration
	DataDir      string
	ShellUser    string
}

func Load() (*Config, error) {
	c := &Config{
		Listen:       envOr("MOCHAN_LISTEN", "127.0.0.1:38421"),
		Username:     envOr("MOCHAN_USERNAME", "admin"),
		PasswordHash: os.Getenv("MOCHAN_PASSWORD_HASH"),
		DataDir:      envOr("MOCHAN_DATA_DIR", "/var/lib/mochan"),
		ShellUser:    os.Getenv("MOCHAN_SHELL_USER"),
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

	if minLen, _ := strconv.Atoi(envOr("MOCHAN_MIN_SECRET_LEN", "32")); len(c.JWTSecret) < minLen {
		return nil, fmt.Errorf("MOCHAN_JWT_SECRET must be at least %d bytes", minLen)
	}

	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
