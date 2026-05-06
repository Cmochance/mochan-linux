package verify

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/alysechen/mochan-linux/server/internal/userdb"
)

type recorder struct {
	mu      sync.Mutex
	mails   []sentMail
	failNow bool
}

type sentMail struct {
	To, Subject, Body string
}

func (r *recorder) Send(ctx context.Context, to, subject, html string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failNow {
		return ErrSenderUnavailable
	}
	r.mails = append(r.mails, sentMail{To: to, Subject: subject, Body: html})
	return nil
}

func openDB(t *testing.T) *userdb.DB {
	t.Helper()
	d, err := userdb.Open(filepath.Join(t.TempDir(), "v.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d
}

func newService(t *testing.T, cfg Config) (*Service, *recorder, *userdb.DB) {
	t.Helper()
	if cfg.CodeLength == 0 {
		cfg = DefaultConfig()
	}
	rec := &recorder{}
	db := openDB(t)
	svc := New(db, cfg, rec)
	return svc, rec, db
}

func extractCode(mail string) string {
	// The HTML wraps the digits in a <div ...>CODE</div>; pull the digits run.
	out := []byte{}
	collecting := false
	for i := 0; i < len(mail); i++ {
		c := mail[i]
		if c == '>' {
			collecting = true
			out = out[:0]
			continue
		}
		if c == '<' {
			if len(out) >= 4 {
				// looks like a code-sized digit run
				digits := true
				for _, b := range out {
					if b < '0' || b > '9' {
						digits = false
						break
					}
				}
				if digits {
					return string(out)
				}
			}
			collecting = false
			continue
		}
		if collecting && c != ' ' && c != '\n' && c != '\t' {
			out = append(out, c)
		}
	}
	return ""
}

func TestSendVerifyHappyPath(t *testing.T) {
	svc, rec, _ := newService(t, DefaultConfig())
	ctx := context.Background()

	if _, err := svc.Send(ctx, "Alice@example.com", PurposeRegister, "1.2.3.4"); err != nil {
		t.Fatalf("send: %v", err)
	}
	if len(rec.mails) != 1 {
		t.Fatalf("mails sent = %d", len(rec.mails))
	}
	code := extractCode(rec.mails[0].Body)
	if len(code) != 6 {
		t.Fatalf("extracted code = %q", code)
	}
	if rec.mails[0].To != "alice@example.com" {
		t.Fatalf("recipient lowercased: %s", rec.mails[0].To)
	}

	if err := svc.Verify(ctx, "ALICE@example.com", PurposeRegister, code); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if err := svc.Consume(ctx, "alice@example.com", PurposeRegister); err != nil {
		t.Fatalf("consume: %v", err)
	}
	// double-consume blocked
	if err := svc.Consume(ctx, "alice@example.com", PurposeRegister); err == nil {
		t.Fatal("double consume accepted")
	}
}

func TestSendCooldown(t *testing.T) {
	svc, _, _ := newService(t, DefaultConfig())
	ctx := context.Background()

	if _, err := svc.Send(ctx, "a@b.com", PurposeRegister, "1.1.1.1"); err != nil {
		t.Fatal(err)
	}
	cd, err := svc.Send(ctx, "a@b.com", PurposeRegister, "1.1.1.1")
	if err != ErrCooldown || cd <= 0 {
		t.Fatalf("expected cooldown, got cd=%d err=%v", cd, err)
	}
}

func TestIPHourlyLimit(t *testing.T) {
	cfg := DefaultConfig()
	cfg.IPHourlyLimit = 3
	cfg.SendCooldown = 0 // cooldown is per-email, not per-IP, so disable to isolate
	svc, _, _ := newService(t, cfg)
	ctx := context.Background()

	for i := 0; i < cfg.IPHourlyLimit; i++ {
		if _, err := svc.Send(ctx, fmtEmail(i), PurposeRegister, "9.9.9.9"); err != nil {
			t.Fatalf("send %d: %v", i, err)
		}
	}
	if _, err := svc.Send(ctx, fmtEmail(99), PurposeRegister, "9.9.9.9"); err != ErrIPLimit {
		t.Fatalf("expected ErrIPLimit, got %v", err)
	}
}

func TestVerifyAttemptCap(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MaxAttempts = 3
	svc, rec, _ := newService(t, cfg)
	ctx := context.Background()

	if _, err := svc.Send(ctx, "limit@example.com", PurposeRegister, "1.2.3.4"); err != nil {
		t.Fatal(err)
	}
	correct := extractCode(rec.mails[0].Body)
	wrong := "000000"
	if wrong == correct {
		wrong = "111111"
	}

	for i := 0; i < cfg.MaxAttempts; i++ {
		if err := svc.Verify(ctx, "limit@example.com", PurposeRegister, wrong); err != ErrCodeMismatch {
			t.Fatalf("attempt %d: got %v, want ErrCodeMismatch", i, err)
		}
	}
	if err := svc.Verify(ctx, "limit@example.com", PurposeRegister, correct); err != ErrTooManyAttempts {
		t.Fatalf("after cap, correct code returned %v, want ErrTooManyAttempts", err)
	}
}

func TestVerifyExpired(t *testing.T) {
	cfg := DefaultConfig()
	cfg.CodeExpiry = -time.Second // already expired
	svc, rec, _ := newService(t, cfg)
	ctx := context.Background()

	if _, err := svc.Send(ctx, "exp@example.com", PurposeRegister, "1.2.3.4"); err != nil {
		t.Fatal(err)
	}
	code := extractCode(rec.mails[0].Body)
	if err := svc.Verify(ctx, "exp@example.com", PurposeRegister, code); err != ErrCodeExpired {
		t.Fatalf("expected ErrCodeExpired, got %v", err)
	}
}

func TestSendUnconfigured(t *testing.T) {
	db := openDB(t)
	svc := New(db, DefaultConfig(), nil) // no sender, no APIKey
	if _, err := svc.Send(context.Background(), "a@b.com", PurposeRegister, "1.1.1.1"); err != ErrSenderUnavailable {
		t.Fatalf("expected ErrSenderUnavailable, got %v", err)
	}
	if svc.Configured() {
		t.Fatal("should not be configured")
	}
}

func fmtEmail(i int) string {
	return string(rune('a'+i)) + "@example.com"
}
