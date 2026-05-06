// Package auth issues and validates JWTs against accounts stored in the
// userdb. Login looks the user up by username or email; inactive users are
// rejected even with a valid password.
package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/alysechen/mochan-linux/server/internal/userdb"
)

// Authenticator wraps the user store and signing parameters.
type Authenticator struct {
	db     *userdb.DB
	secret []byte
	ttl    time.Duration
}

// New returns an Authenticator backed by the given user database.
func New(db *userdb.DB, secret []byte, ttl time.Duration) *Authenticator {
	return &Authenticator{db: db, secret: secret, ttl: ttl}
}

// Common errors. Verify never reveals whether the username or password was
// wrong (callers map both to 401).
var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrInactive           = errors.New("account inactive")
)

// VerifyResult holds the matched user when login succeeds.
type VerifyResult struct {
	User *userdb.User
}

// Verify resolves identifier (username or email) and compares password.
// Returns ErrInactive if the row is disabled.
func (a *Authenticator) Verify(ctx context.Context, identifier, password string) (*VerifyResult, error) {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" || password == "" {
		// Run a no-op compare so timing roughly matches the real path.
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$"+strings.Repeat("a", 53)), []byte(password))
		return nil, ErrInvalidCredentials
	}
	u, err := a.db.GetUserByIdentifier(ctx, identifier)
	if errors.Is(err, userdb.ErrNotFound) {
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$10$"+strings.Repeat("a", 53)), []byte(password))
		return nil, ErrInvalidCredentials
	}
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	if !u.IsActive {
		return nil, ErrInactive
	}
	return &VerifyResult{User: u}, nil
}

// Claims carry the standard JWT registered fields plus the user role and id.
type Claims struct {
	Role string `json:"role,omitempty"`
	UID  int64  `json:"uid,omitempty"`
	jwt.RegisteredClaims
}

// Issue creates a signed token for the given user. Subject = username so
// existing handlers that read `Subject` keep working.
func (a *Authenticator) Issue(u *userdb.User) (string, time.Time, error) {
	exp := time.Now().Add(a.ttl)
	claims := Claims{
		Role: u.Role,
		UID:  u.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   u.Username,
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "mochan-linux",
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(a.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, exp, nil
}

// Parse validates a token and returns its claims.
func (a *Authenticator) Parse(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return a.secret, nil
	})
	if err != nil || !tok.Valid {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

// HashPassword wraps bcrypt with the standard cost.
func HashPassword(plain string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(h), err
}

// BootstrapAdmin ensures the database has at least one admin user. If users
// already exist this is a no-op. Otherwise the env-supplied username/email/
// password-hash form the initial admin so existing single-user installs
// keep working after the upgrade.
func BootstrapAdmin(ctx context.Context, db *userdb.DB, username, email, passwordHash string) error {
	n, err := db.CountUsers(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if username == "" || passwordHash == "" {
		return errors.New("bootstrap: MOCHAN_USERNAME and MOCHAN_PASSWORD_HASH required for initial admin")
	}
	if email == "" {
		// Fall back to a synthetic local address; admin can update later.
		email = strings.ToLower(username) + "@local"
	}
	_, err = db.CreateUser(ctx, username, email, passwordHash, "admin")
	return err
}
