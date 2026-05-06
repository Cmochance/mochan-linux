package userdb

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.db")
	d, err := Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d
}

func TestUserCRUD(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	n, err := d.CountUsers(ctx)
	if err != nil || n != 0 {
		t.Fatalf("initial count = %d, err=%v", n, err)
	}

	u, err := d.CreateUser(ctx, "Admin", "Admin@Example.com", "$2y$10$hash", "admin")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if u.Username != "Admin" || u.Email != "admin@example.com" || u.Role != "admin" || !u.IsActive {
		t.Fatalf("created = %+v", u)
	}

	// case-insensitive lookup by either column
	got, err := d.GetUserByIdentifier(ctx, "admin")
	if err != nil || got.ID != u.ID {
		t.Fatalf("by username: %v, %+v", err, got)
	}
	got, err = d.GetUserByIdentifier(ctx, "ADMIN@EXAMPLE.COM")
	if err != nil || got.ID != u.ID {
		t.Fatalf("by email: %v, %+v", err, got)
	}

	// duplicate username/email rejected
	if _, err := d.CreateUser(ctx, "admin", "x@y.com", "h", "user"); err == nil {
		t.Fatal("duplicate username accepted")
	}
	if _, err := d.CreateUser(ctx, "other", "Admin@example.com", "h", "user"); err == nil {
		t.Fatal("duplicate email accepted")
	}

	if err := d.UpdatePassword(ctx, u.ID, "$2y$10$new"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetActive(ctx, u.ID, false); err != nil {
		t.Fatal(err)
	}
	got, err = d.GetUserByID(ctx, u.ID)
	if err != nil || got.PasswordHash != "$2y$10$new" || got.IsActive {
		t.Fatalf("after update: %+v err=%v", got, err)
	}

	users, err := d.ListUsers(ctx)
	if err != nil || len(users) != 1 {
		t.Fatalf("list: %d %v", len(users), err)
	}
}

func TestInviteLifecycle(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()
	admin, _ := d.CreateUser(ctx, "admin", "a@b.com", "h", "admin")

	inv, err := d.CreateInvite(ctx, "ABC123", "guest@example.com", admin.ID, time.Hour)
	if err != nil {
		t.Fatalf("create invite: %v", err)
	}
	if inv.Code != "ABC123" || inv.Email != "guest@example.com" {
		t.Fatalf("invite = %+v", inv)
	}

	if _, err := d.GetInviteByCode(ctx, "ABC123"); err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if _, err := d.GetInviteByCode(ctx, "missing"); err != ErrNotFound {
		t.Fatalf("missing lookup: %v", err)
	}

	guest, _ := d.CreateUser(ctx, "guest", "guest@example.com", "h", "user")
	if err := d.ConsumeInvite(ctx, "ABC123", guest.ID); err != nil {
		t.Fatalf("consume: %v", err)
	}
	// double-consume fails
	if err := d.ConsumeInvite(ctx, "ABC123", guest.ID); err != ErrNotFound {
		t.Fatalf("double consume returned %v", err)
	}

	// expired invite cannot be consumed
	expired, _ := d.CreateInvite(ctx, "EXPIRED", "", admin.ID, -time.Minute)
	if err := d.ConsumeInvite(ctx, expired.Code, guest.ID); err != ErrNotFound {
		t.Fatalf("expired consume returned %v", err)
	}

	// delete only works on unused
	open, _ := d.CreateInvite(ctx, "OPEN", "", admin.ID, time.Hour)
	if err := d.DeleteInvite(ctx, open.ID); err != nil {
		t.Fatalf("delete unused: %v", err)
	}
	if err := d.DeleteInvite(ctx, inv.ID); err != ErrNotFound {
		t.Fatalf("delete used returned %v", err)
	}
}

func TestVerificationLifecycle(t *testing.T) {
	d := openTestDB(t)
	ctx := context.Background()

	v1, err := d.CreateVerification(ctx, "Alice@example.com", "hash1", "register", "1.2.3.4", 5*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if v1.Email != "alice@example.com" {
		t.Fatalf("email lowercased: %s", v1.Email)
	}

	latest, err := d.LatestVerification(ctx, "alice@example.com", "register")
	if err != nil || latest.ID != v1.ID {
		t.Fatalf("latest: %v, %+v", err, latest)
	}

	if err := d.IncrAttempts(ctx, v1.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetVerificationByID(ctx, v1.ID)
	if got.Attempts != 1 {
		t.Fatalf("attempts = %d", got.Attempts)
	}

	// ip throttle counting
	since := time.Now().Add(-time.Hour)
	n, err := d.CountIPSendsSince(ctx, "1.2.3.4", since)
	if err != nil || n != 1 {
		t.Fatalf("count: %d %v", n, err)
	}

	if err := d.MarkVerified(ctx, v1.ID); err != nil {
		t.Fatal(err)
	}
	if err := d.MarkConsumed(ctx, v1.ID); err != nil {
		t.Fatal(err)
	}
	got, _ = d.GetVerificationByID(ctx, v1.ID)
	if !got.Verified() || !got.Consumed() {
		t.Fatalf("flags: %+v", got)
	}
}
