// Package verify issues, persists, and validates short numeric codes sent
// to user email addresses for registration and password reset flows. Codes
// are stored hashed; rate limits are enforced both per-email (cooldown) and
// per-IP (hourly cap).
package verify

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/alysechen/mochan-linux/server/internal/userdb"
)

// Purpose namespaces a verification flow. Adding a new purpose only requires
// listing it here and including it in the email subject/body switch.
type Purpose string

const (
	PurposeRegister      Purpose = "register"
	PurposeResetPassword Purpose = "reset_password"
)

// Config tunes the rate limits and code parameters. Defaults match Mochat's
// settings so a shared Resend account behaves consistently.
type Config struct {
	CodeLength        int
	CodeExpiry        time.Duration
	SendCooldown      time.Duration
	IPHourlyLimit     int
	MaxAttempts       int
	FromEmail         string
	APIKey            string
	HTTPClient        *http.Client
}

// DefaultConfig returns a Config with reasonable defaults; callers override
// the secrets (APIKey, FromEmail) from env.
func DefaultConfig() Config {
	return Config{
		CodeLength:    6,
		CodeExpiry:    5 * time.Minute,
		SendCooldown:  60 * time.Second,
		IPHourlyLimit: 10,
		MaxAttempts:   5,
	}
}

// Sender abstracts the outbound email transport so tests can substitute a
// recorder without touching the network.
type Sender interface {
	Send(ctx context.Context, to, subject, html string) error
}

// Service issues and validates verification codes.
type Service struct {
	db     *userdb.DB
	cfg    Config
	sender Sender
}

// New wires up a Service. If sender is nil and APIKey is set, a Resend
// sender is constructed automatically.
func New(db *userdb.DB, cfg Config, sender Sender) *Service {
	if sender == nil && cfg.APIKey != "" {
		client := cfg.HTTPClient
		if client == nil {
			client = &http.Client{Timeout: 15 * time.Second}
		}
		sender = &resendSender{apiKey: cfg.APIKey, fromEmail: cfg.FromEmail, client: client}
	}
	return &Service{db: db, cfg: cfg, sender: sender}
}

// Configured reports whether the service has a working sender.
func (s *Service) Configured() bool { return s.sender != nil }

// Errors returned by Send / Verify. Keep these stable so handlers can map
// them to HTTP status codes.
var (
	ErrCooldown          = errors.New("verification: too soon, wait before requesting another code")
	ErrIPLimit           = errors.New("verification: hourly send limit reached for this address")
	ErrInvalidPurpose    = errors.New("verification: unknown purpose")
	ErrEmailRequired     = errors.New("verification: email required")
	ErrCodeMismatch      = errors.New("verification: invalid code")
	ErrCodeExpired       = errors.New("verification: code expired")
	ErrCodeConsumed      = errors.New("verification: code already used")
	ErrTooManyAttempts   = errors.New("verification: too many attempts, request a new code")
	ErrSenderUnavailable = errors.New("verification: email service not configured")
)

// Send issues a fresh code for (email, purpose) honoring the rate limits,
// emails it via the sender, and persists the hashed code. Returns the
// remaining cooldown seconds for the just-issued code.
func (s *Service) Send(ctx context.Context, email string, purpose Purpose, ip string) (cooldownSeconds int, err error) {
	if !validPurpose(purpose) {
		return 0, ErrInvalidPurpose
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return 0, ErrEmailRequired
	}
	if !s.Configured() {
		return 0, ErrSenderUnavailable
	}

	if cooldown, err := s.CooldownSeconds(ctx, email, purpose); err != nil {
		return 0, err
	} else if cooldown > 0 {
		return cooldown, ErrCooldown
	}

	since := time.Now().Add(-time.Hour)
	if n, err := s.db.CountIPSendsSince(ctx, ip, since); err != nil {
		return 0, err
	} else if n >= s.cfg.IPHourlyLimit {
		return 0, ErrIPLimit
	}

	code, err := generateCode(s.cfg.CodeLength)
	if err != nil {
		return 0, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.MinCost+2)
	if err != nil {
		return 0, err
	}

	if _, err := s.db.CreateVerification(ctx, email, string(hash), string(purpose), ip, s.cfg.CodeExpiry); err != nil {
		return 0, err
	}

	subject, body := renderEmail(purpose, code, s.cfg.CodeExpiry)
	if err := s.sender.Send(ctx, email, subject, body); err != nil {
		return 0, err
	}
	return int(s.cfg.SendCooldown.Seconds()), nil
}

// CooldownSeconds returns 0 if the (email, purpose) pair may request a new
// code, otherwise the remaining seconds the caller must wait.
func (s *Service) CooldownSeconds(ctx context.Context, email string, purpose Purpose) (int, error) {
	v, err := s.db.LatestVerification(ctx, email, string(purpose))
	if errors.Is(err, userdb.ErrNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	wait := s.cfg.SendCooldown - time.Since(v.CreatedAt)
	if wait <= 0 {
		return 0, nil
	}
	return int(wait.Seconds()) + 1, nil
}

// Verify checks `code` against the latest unconsumed verification for
// (email, purpose). On success the row is marked verified (but not
// consumed — callers should call Consume after the protected action
// completes so a registration that fails halfway can retry without a new
// email).
func (s *Service) Verify(ctx context.Context, email string, purpose Purpose, code string) error {
	if !validPurpose(purpose) {
		return ErrInvalidPurpose
	}
	v, err := s.db.LatestVerification(ctx, strings.ToLower(strings.TrimSpace(email)), string(purpose))
	if errors.Is(err, userdb.ErrNotFound) {
		return ErrCodeMismatch
	}
	if err != nil {
		return err
	}
	if v.Consumed() {
		return ErrCodeConsumed
	}
	if time.Now().After(v.ExpiresAt) {
		return ErrCodeExpired
	}
	if v.Attempts >= s.cfg.MaxAttempts {
		return ErrTooManyAttempts
	}

	if err := bcrypt.CompareHashAndPassword([]byte(v.CodeHash), []byte(strings.TrimSpace(code))); err != nil {
		_ = s.db.IncrAttempts(ctx, v.ID)
		return ErrCodeMismatch
	}
	return s.db.MarkVerified(ctx, v.ID)
}

// Consume marks the most recent verified+unconsumed row for (email, purpose)
// as used, blocking it from being re-used by replay or stale clients.
func (s *Service) Consume(ctx context.Context, email string, purpose Purpose) error {
	v, err := s.db.LatestVerification(ctx, strings.ToLower(strings.TrimSpace(email)), string(purpose))
	if err != nil {
		return err
	}
	if !v.Verified() || v.Consumed() {
		return ErrCodeMismatch
	}
	return s.db.MarkConsumed(ctx, v.ID)
}

func validPurpose(p Purpose) bool {
	return p == PurposeRegister || p == PurposeResetPassword
}

func generateCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	out := make([]byte, length)
	for i := range out {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		out[i] = byte('0' + n.Int64())
	}
	return string(out), nil
}

func renderEmail(purpose Purpose, code string, ttl time.Duration) (subject, html string) {
	switch purpose {
	case PurposeResetPassword:
		subject = "[mochan-linux] 您的密码重置验证码"
	default:
		subject = "[mochan-linux] 您的注册验证码"
	}
	mins := int(ttl.Minutes())
	if mins < 1 {
		mins = 1
	}
	html = fmt.Sprintf(`<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f5f3ef;padding:32px;color:#1a1a1a">
  <div style="max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:6px">
    <h2 style="margin:0 0 12px">mochan-linux</h2>
    <p>您的验证码为：</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#f9f7f4;border:1px dashed #d4c5b0;padding:18px;margin:16px 0;font-family:'Courier New',monospace">%s</div>
    <p style="color:#666;font-size:13px">验证码 <strong>%d 分钟</strong>内有效。如非本人操作，请忽略此邮件。</p>
  </div>
</body></html>`, code, mins)
	return
}

// resendSender posts emails to api.resend.com.
type resendSender struct {
	apiKey    string
	fromEmail string
	client    *http.Client
}

func (r *resendSender) Send(ctx context.Context, to, subject, html string) error {
	if r.apiKey == "" {
		return ErrSenderUnavailable
	}
	from := r.fromEmail
	if from == "" {
		from = "mochan-linux <noreply@auth.mochance.xyz>"
	}
	body := map[string]any{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"html":    html,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", strings.NewReader(string(payload)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	return fmt.Errorf("resend: status %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
}
