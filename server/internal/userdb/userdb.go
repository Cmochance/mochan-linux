// Package userdb owns the SQLite-backed user, invite, and verification
// state. The database is a single file under DataDir; schema is created at
// open time and migrated forward in the same call.
package userdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
	email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	role          TEXT NOT NULL DEFAULT 'user',
	is_active     INTEGER NOT NULL DEFAULT 1,
	created_at    INTEGER NOT NULL,
	updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS invites (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	code        TEXT NOT NULL UNIQUE,
	email       TEXT COLLATE NOCASE,
	created_by  INTEGER REFERENCES users(id),
	created_at  INTEGER NOT NULL,
	expires_at  INTEGER NOT NULL,
	used_by     INTEGER REFERENCES users(id),
	used_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);

CREATE TABLE IF NOT EXISTS verifications (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	email       TEXT NOT NULL COLLATE NOCASE,
	code_hash   TEXT NOT NULL,
	purpose     TEXT NOT NULL,
	ip          TEXT NOT NULL,
	attempts    INTEGER NOT NULL DEFAULT 0,
	created_at  INTEGER NOT NULL,
	expires_at  INTEGER NOT NULL,
	consumed_at INTEGER,
	verified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_verifications_lookup ON verifications(email, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_verifications_ip ON verifications(ip, created_at);
`

// User is the persisted account record.
type User struct {
	ID           int64
	Username     string
	Email        string
	PasswordHash string
	Role         string
	IsActive     bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Invite is a pre-issued registration token. An invite may optionally bind
// to a specific email; if Email is empty the holder may register any email.
// UsedAt is nullable unix seconds (SQLite INTEGER) rather than NullTime.
type Invite struct {
	ID        int64
	Code      string
	Email     string
	CreatedBy int64
	CreatedAt time.Time
	ExpiresAt time.Time
	UsedBy    sql.NullInt64
	UsedAt    sql.NullInt64
}

// Used reports whether the invite has been consumed.
func (i *Invite) Used() bool { return i != nil && i.UsedAt.Valid }

// Verification stores the hashed code, attempt counter, and lifecycle
// timestamps for one /verify/send issuance. ConsumedAt / VerifiedAt are
// nullable unix seconds rather than NullTime because SQLite stores them as
// INTEGER and the standard time scanner expects a string format.
type Verification struct {
	ID         int64
	Email      string
	CodeHash   string
	Purpose    string
	IP         string
	Attempts   int
	CreatedAt  time.Time
	ExpiresAt  time.Time
	ConsumedAt sql.NullInt64
	VerifiedAt sql.NullInt64
}

// Verified reports whether the row has been marked verified.
func (v *Verification) Verified() bool { return v != nil && v.VerifiedAt.Valid }

// Consumed reports whether the row has been marked consumed.
func (v *Verification) Consumed() bool { return v != nil && v.ConsumedAt.Valid }

// DB wraps *sql.DB with mochan-specific helpers.
type DB struct {
	sql *sql.DB
}

// Open returns a DB ready for use. The schema is created idempotently.
func Open(path string) (*DB, error) {
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	sqldb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	sqldb.SetMaxOpenConns(1) // serialize writes; SQLite WAL still lets reads concurrently
	if _, err := sqldb.Exec(schema); err != nil {
		_ = sqldb.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &DB{sql: sqldb}, nil
}

// Close releases the database handle.
func (d *DB) Close() error {
	if d == nil || d.sql == nil {
		return nil
	}
	return d.sql.Close()
}

// SQL exposes the underlying *sql.DB for advanced callers (kept narrow).
func (d *DB) SQL() *sql.DB { return d.sql }

// ErrNotFound is returned when a lookup misses.
var ErrNotFound = errors.New("not found")

// CountUsers returns the number of rows in users (used to decide whether the
// bootstrap admin should be created from env).
func (d *DB) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := d.sql.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

// CreateUser inserts a row and returns the populated User. Caller passes the
// already-hashed password.
func (d *DB) CreateUser(ctx context.Context, username, email, passwordHash, role string) (*User, error) {
	now := time.Now().UTC()
	res, err := d.sql.ExecContext(ctx,
		`INSERT INTO users(username, email, password_hash, role, is_active, created_at, updated_at)
		 VALUES(?, ?, ?, ?, 1, ?, ?)`,
		strings.TrimSpace(username), strings.ToLower(strings.TrimSpace(email)), passwordHash, role, now.Unix(), now.Unix())
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return d.GetUserByID(ctx, id)
}

// GetUserByID looks up a user by row id.
func (d *DB) GetUserByID(ctx context.Context, id int64) (*User, error) {
	row := d.sql.QueryRowContext(ctx, `SELECT id, username, email, password_hash, role, is_active, created_at, updated_at FROM users WHERE id = ?`, id)
	return scanUser(row)
}

// GetUserByIdentifier resolves a username or email to a User row. Lookups
// are case-insensitive (the columns use COLLATE NOCASE).
func (d *DB) GetUserByIdentifier(ctx context.Context, ident string) (*User, error) {
	ident = strings.TrimSpace(ident)
	if ident == "" {
		return nil, ErrNotFound
	}
	col := "username"
	if strings.Contains(ident, "@") {
		col = "email"
	}
	row := d.sql.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, is_active, created_at, updated_at FROM users WHERE `+col+` = ?`,
		ident)
	return scanUser(row)
}

// UpdatePassword swaps the bcrypt hash for an existing user.
func (d *DB) UpdatePassword(ctx context.Context, userID int64, newHash string) error {
	now := time.Now().UTC().Unix()
	_, err := d.sql.ExecContext(ctx, `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, newHash, now, userID)
	return err
}

// SetActive flips the is_active flag (admins use this to disable accounts).
func (d *DB) SetActive(ctx context.Context, userID int64, active bool) error {
	now := time.Now().UTC().Unix()
	v := 0
	if active {
		v = 1
	}
	_, err := d.sql.ExecContext(ctx, `UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?`, v, now, userID)
	return err
}

// ListUsers returns all rows ordered by id (small table; no pagination).
func (d *DB) ListUsers(ctx context.Context) ([]*User, error) {
	rows, err := d.sql.QueryContext(ctx, `SELECT id, username, email, password_hash, role, is_active, created_at, updated_at FROM users ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// CreateInvite stores a fresh invite. Returns the populated record.
func (d *DB) CreateInvite(ctx context.Context, code, email string, createdBy int64, ttl time.Duration) (*Invite, error) {
	now := time.Now().UTC()
	exp := now.Add(ttl)
	_, err := d.sql.ExecContext(ctx,
		`INSERT INTO invites(code, email, created_by, created_at, expires_at) VALUES(?, ?, ?, ?, ?)`,
		code, strings.ToLower(strings.TrimSpace(email)), createdBy, now.Unix(), exp.Unix())
	if err != nil {
		return nil, err
	}
	return d.GetInviteByCode(ctx, code)
}

// GetInviteByCode loads an invite (regardless of consumption state).
func (d *DB) GetInviteByCode(ctx context.Context, code string) (*Invite, error) {
	row := d.sql.QueryRowContext(ctx,
		`SELECT id, code, COALESCE(email, ''), created_by, created_at, expires_at, used_by, used_at FROM invites WHERE code = ?`,
		code)
	var inv Invite
	var created, expires int64
	if err := row.Scan(&inv.ID, &inv.Code, &inv.Email, &inv.CreatedBy, &created, &expires, &inv.UsedBy, &inv.UsedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	inv.CreatedAt = time.Unix(created, 0).UTC()
	inv.ExpiresAt = time.Unix(expires, 0).UTC()
	return &inv, nil
}

// ListInvites returns all invites newest first.
func (d *DB) ListInvites(ctx context.Context) ([]*Invite, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT id, code, COALESCE(email, ''), created_by, created_at, expires_at, used_by, used_at FROM invites ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Invite
	for rows.Next() {
		var inv Invite
		var created, expires int64
		if err := rows.Scan(&inv.ID, &inv.Code, &inv.Email, &inv.CreatedBy, &created, &expires, &inv.UsedBy, &inv.UsedAt); err != nil {
			return nil, err
		}
		inv.CreatedAt = time.Unix(created, 0).UTC()
		inv.ExpiresAt = time.Unix(expires, 0).UTC()
		out = append(out, &inv)
	}
	return out, rows.Err()
}

// ConsumeInvite marks an invite as used. Returns ErrNotFound if the code is
// unknown, expired, or already consumed.
func (d *DB) ConsumeInvite(ctx context.Context, code string, userID int64) error {
	now := time.Now().UTC().Unix()
	res, err := d.sql.ExecContext(ctx,
		`UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_at IS NULL AND expires_at > ?`,
		userID, now, code, now)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteInvite removes an unused invite. Used invites are kept for audit.
func (d *DB) DeleteInvite(ctx context.Context, id int64) error {
	res, err := d.sql.ExecContext(ctx, `DELETE FROM invites WHERE id = ? AND used_at IS NULL`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// CreateVerification stores a freshly hashed code with its rate-limit metadata.
func (d *DB) CreateVerification(ctx context.Context, email, codeHash, purpose, ip string, ttl time.Duration) (*Verification, error) {
	now := time.Now().UTC()
	exp := now.Add(ttl)
	res, err := d.sql.ExecContext(ctx,
		`INSERT INTO verifications(email, code_hash, purpose, ip, attempts, created_at, expires_at) VALUES(?, ?, ?, ?, 0, ?, ?)`,
		strings.ToLower(strings.TrimSpace(email)), codeHash, purpose, ip, now.Unix(), exp.Unix())
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return d.GetVerificationByID(ctx, id)
}

// GetVerificationByID loads a verification by row id.
func (d *DB) GetVerificationByID(ctx context.Context, id int64) (*Verification, error) {
	row := d.sql.QueryRowContext(ctx,
		`SELECT id, email, code_hash, purpose, ip, attempts, created_at, expires_at, consumed_at, verified_at FROM verifications WHERE id = ?`, id)
	return scanVerification(row)
}

// LatestVerification returns the most recently issued unconsumed code for
// the (email, purpose) pair, or ErrNotFound.
func (d *DB) LatestVerification(ctx context.Context, email, purpose string) (*Verification, error) {
	row := d.sql.QueryRowContext(ctx,
		`SELECT id, email, code_hash, purpose, ip, attempts, created_at, expires_at, consumed_at, verified_at
		   FROM verifications
		  WHERE email = ? AND purpose = ?
		  ORDER BY created_at DESC LIMIT 1`,
		strings.ToLower(strings.TrimSpace(email)), purpose)
	return scanVerification(row)
}

// CountIPSendsSince returns how many verifications were issued from `ip`
// since `since`. Used for hourly per-IP throttling.
func (d *DB) CountIPSendsSince(ctx context.Context, ip string, since time.Time) (int, error) {
	var n int
	err := d.sql.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM verifications WHERE ip = ? AND created_at >= ?`, ip, since.UTC().Unix()).Scan(&n)
	return n, err
}

// IncrAttempts bumps the attempt counter for one verification row.
func (d *DB) IncrAttempts(ctx context.Context, id int64) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE verifications SET attempts = attempts + 1 WHERE id = ?`, id)
	return err
}

// MarkVerified flags a verification as successfully verified (the user has
// proven control of the email). The row remains consumable on next call.
func (d *DB) MarkVerified(ctx context.Context, id int64) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE verifications SET verified_at = ? WHERE id = ?`, time.Now().UTC().Unix(), id)
	return err
}

// MarkConsumed flags a verification as used (e.g. registration completed).
func (d *DB) MarkConsumed(ctx context.Context, id int64) error {
	_, err := d.sql.ExecContext(ctx, `UPDATE verifications SET consumed_at = ? WHERE id = ?`, time.Now().UTC().Unix(), id)
	return err
}

func scanUser(row scannable) (*User, error) {
	var u User
	var created, updated int64
	var active int
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &active, &created, &updated); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	u.IsActive = active != 0
	u.CreatedAt = time.Unix(created, 0).UTC()
	u.UpdatedAt = time.Unix(updated, 0).UTC()
	return &u, nil
}

func scanVerification(row scannable) (*Verification, error) {
	var v Verification
	var created, expires int64
	if err := row.Scan(&v.ID, &v.Email, &v.CodeHash, &v.Purpose, &v.IP, &v.Attempts, &created, &expires, &v.ConsumedAt, &v.VerifiedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	v.CreatedAt = time.Unix(created, 0).UTC()
	v.ExpiresAt = time.Unix(expires, 0).UTC()
	return &v, nil
}

type scannable interface {
	Scan(dest ...any) error
}
