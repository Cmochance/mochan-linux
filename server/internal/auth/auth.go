package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Authenticator struct {
	username     string
	passwordHash []byte
	secret       []byte
	ttl          time.Duration
}

func New(username, passwordHash string, secret []byte, ttl time.Duration) *Authenticator {
	return &Authenticator{
		username:     username,
		passwordHash: []byte(passwordHash),
		secret:       secret,
		ttl:          ttl,
	}
}

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
)

func (a *Authenticator) Verify(username, password string) error {
	if username != a.username {
		// constant-time-ish: still hash to avoid trivial username enumeration
		_ = bcrypt.CompareHashAndPassword(a.passwordHash, []byte(password))
		return ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword(a.passwordHash, []byte(password)); err != nil {
		return ErrInvalidCredentials
	}
	return nil
}

type Claims struct {
	jwt.RegisteredClaims
}

func (a *Authenticator) Issue(username string) (string, time.Time, error) {
	exp := time.Now().Add(a.ttl)
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   username,
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
