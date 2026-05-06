// Package accounts mounts the HTTP routes for registration, verification
// codes, and admin invite/user management. It owns no state — userdb,
// auth, and verify are injected.
package accounts

import (
	"crypto/rand"
	"encoding/base32"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/userdb"
	"github.com/alysechen/mochan-linux/server/internal/verify"
)

// Handler holds the dependencies needed to serve registration and admin
// account endpoints.
type Handler struct {
	DB        *userdb.DB
	Auth      *auth.Authenticator
	Verify    *verify.Service
	Audit     *audit.Logger
	InviteTTL time.Duration
}

// MountPublic registers /verify/* and /auth/register on a router that does
// NOT require authentication. They are rate-limited at the verify-service
// layer.
func (h *Handler) MountPublic(r chi.Router) {
	r.Post("/verify/send", h.sendCode)
	r.Get("/verify/cooldown", h.cooldown)
	r.Post("/auth/register", h.register)
}

// MountAdmin registers /admin/* on a router that already runs the auth
// middleware. The handler itself enforces the admin role.
func (h *Handler) MountAdmin(r chi.Router) {
	r.Get("/admin/users", h.requireAdmin(h.listUsers))
	r.Patch("/admin/users/{id}", h.requireAdmin(h.patchUser))
	r.Get("/admin/invites", h.requireAdmin(h.listInvites))
	r.Post("/admin/invites", h.requireAdmin(h.createInvite))
	r.Delete("/admin/invites/{id}", h.requireAdmin(h.deleteInvite))
}

func (h *Handler) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c, ok := auth.ClaimsFrom(r.Context())
		if !ok || c.Role != "admin" {
			http.Error(w, "admin only", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

type sendCodeReq struct {
	Email   string `json:"email"`
	Purpose string `json:"purpose"`
}

type sendCodeResp struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	ExpiresIn int    `json:"expires_in"`
	Cooldown  int    `json:"cooldown"`
}

func (h *Handler) sendCode(w http.ResponseWriter, r *http.Request) {
	var body sendCodeReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	purpose := verify.Purpose(strings.TrimSpace(body.Purpose))
	ip := audit.ClientIP(r)
	cd, err := h.Verify.Send(r.Context(), body.Email, purpose, ip)
	switch {
	case errors.Is(err, verify.ErrCooldown):
		writeJSON(w, http.StatusTooManyRequests, sendCodeResp{Message: err.Error(), Cooldown: cd})
		return
	case errors.Is(err, verify.ErrIPLimit):
		writeJSON(w, http.StatusTooManyRequests, sendCodeResp{Message: err.Error()})
		return
	case errors.Is(err, verify.ErrEmailRequired), errors.Is(err, verify.ErrInvalidPurpose):
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	case errors.Is(err, verify.ErrSenderUnavailable):
		http.Error(w, "email service not configured on this server", http.StatusServiceUnavailable)
		return
	case err != nil:
		http.Error(w, "send failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, sendCodeResp{
		Success:   true,
		Message:   "code sent",
		ExpiresIn: int((5 * time.Minute).Seconds()),
		Cooldown:  cd,
	})
}

func (h *Handler) cooldown(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	purpose := verify.Purpose(r.URL.Query().Get("purpose"))
	cd, err := h.Verify.CooldownSeconds(r.Context(), email, purpose)
	if err != nil {
		http.Error(w, "lookup failed", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"cooldown": cd, "can_send": cd == 0})
}

type registerReq struct {
	Username   string `json:"username"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	Code       string `json:"code"`
	InviteCode string `json:"invite_code"`
}

type registerResp struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var body registerReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	body.Username = strings.TrimSpace(body.Username)
	body.Email = strings.ToLower(strings.TrimSpace(body.Email))
	body.InviteCode = strings.TrimSpace(body.InviteCode)
	body.Code = strings.TrimSpace(body.Code)

	if err := validateUsername(body.Username); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !looksLikeEmail(body.Email) {
		http.Error(w, "invalid email", http.StatusBadRequest)
		return
	}
	if err := validatePassword(body.Password); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body.InviteCode == "" {
		http.Error(w, "invite_code required", http.StatusBadRequest)
		return
	}
	if body.Code == "" {
		http.Error(w, "code required", http.StatusBadRequest)
		return
	}

	// Invite check before verify so wasted codes don't burn the rate limit.
	inv, err := h.DB.GetInviteByCode(r.Context(), body.InviteCode)
	if errors.Is(err, userdb.ErrNotFound) {
		http.Error(w, "invalid invite", http.StatusForbidden)
		return
	}
	if err != nil {
		http.Error(w, "invite lookup failed", http.StatusInternalServerError)
		return
	}
	if inv.Used() {
		http.Error(w, "invite already used", http.StatusForbidden)
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		http.Error(w, "invite expired", http.StatusForbidden)
		return
	}
	if inv.Email != "" && !strings.EqualFold(inv.Email, body.Email) {
		http.Error(w, "invite is bound to a different email", http.StatusForbidden)
		return
	}

	if err := h.Verify.Verify(r.Context(), body.Email, verify.PurposeRegister, body.Code); err != nil {
		switch {
		case errors.Is(err, verify.ErrCodeMismatch),
			errors.Is(err, verify.ErrCodeExpired),
			errors.Is(err, verify.ErrCodeConsumed),
			errors.Is(err, verify.ErrTooManyAttempts):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, "verify failed", http.StatusInternalServerError)
		}
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		http.Error(w, "hash failed", http.StatusInternalServerError)
		return
	}
	user, err := h.DB.CreateUser(r.Context(), body.Username, body.Email, hash, "user")
	if err != nil {
		// Most realistic failure is duplicate username/email.
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			http.Error(w, "username or email already in use", http.StatusConflict)
			return
		}
		http.Error(w, "create failed", http.StatusInternalServerError)
		return
	}
	if err := h.DB.ConsumeInvite(r.Context(), inv.Code, user.ID); err != nil {
		// User got created but invite consumption raced; still report success
		// but log so admins notice.
		h.audit(r, "auth.register.invite_race", body.Username, "warn")
	}
	_ = h.Verify.Consume(r.Context(), body.Email, verify.PurposeRegister)

	h.audit(r, "auth.register", body.Username, "ok")
	writeJSON(w, http.StatusCreated, registerResp{ID: user.ID, Username: user.Username, Email: user.Email, Role: user.Role})
}

func (h *Handler) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.DB.ListUsers(r.Context())
	if err != nil {
		http.Error(w, "list failed", http.StatusInternalServerError)
		return
	}
	type item struct {
		ID        int64     `json:"id"`
		Username  string    `json:"username"`
		Email     string    `json:"email"`
		Role      string    `json:"role"`
		IsActive  bool      `json:"is_active"`
		CreatedAt time.Time `json:"created_at"`
	}
	out := make([]item, 0, len(users))
	for _, u := range users {
		out = append(out, item{ID: u.ID, Username: u.Username, Email: u.Email, Role: u.Role, IsActive: u.IsActive, CreatedAt: u.CreatedAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

type patchUserReq struct {
	IsActive *bool `json:"is_active,omitempty"`
}

func (h *Handler) patchUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var body patchUserReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	if body.IsActive == nil {
		http.Error(w, "no fields to update", http.StatusBadRequest)
		return
	}
	if err := h.DB.SetActive(r.Context(), id, *body.IsActive); err != nil {
		http.Error(w, "update failed", http.StatusInternalServerError)
		return
	}
	h.audit(r, "admin.user.patch", "id="+strconv.FormatInt(id, 10), "ok")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listInvites(w http.ResponseWriter, r *http.Request) {
	invs, err := h.DB.ListInvites(r.Context())
	if err != nil {
		http.Error(w, "list failed", http.StatusInternalServerError)
		return
	}
	type item struct {
		ID        int64     `json:"id"`
		Code      string    `json:"code"`
		Email     string    `json:"email,omitempty"`
		CreatedAt time.Time `json:"created_at"`
		ExpiresAt time.Time `json:"expires_at"`
		Used      bool      `json:"used"`
	}
	out := make([]item, 0, len(invs))
	for _, inv := range invs {
		out = append(out, item{ID: inv.ID, Code: inv.Code, Email: inv.Email, CreatedAt: inv.CreatedAt, ExpiresAt: inv.ExpiresAt, Used: inv.Used()})
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": out})
}

type createInviteReq struct {
	Email string `json:"email,omitempty"`
}

func (h *Handler) createInvite(w http.ResponseWriter, r *http.Request) {
	var body createInviteReq
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&body); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	c, _ := auth.ClaimsFrom(r.Context())
	code, err := GenerateInviteCode()
	if err != nil {
		http.Error(w, "rng failed", http.StatusInternalServerError)
		return
	}
	inv, err := h.DB.CreateInvite(r.Context(), code, body.Email, c.UID, h.InviteTTL)
	if err != nil {
		http.Error(w, "create failed", http.StatusInternalServerError)
		return
	}
	h.audit(r, "admin.invite.create", code, "ok")
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         inv.ID,
		"code":       inv.Code,
		"email":      inv.Email,
		"expires_at": inv.ExpiresAt,
	})
}

func (h *Handler) deleteInvite(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	if err := h.DB.DeleteInvite(r.Context(), id); err != nil {
		if errors.Is(err, userdb.ErrNotFound) {
			http.Error(w, "not found or already used", http.StatusNotFound)
			return
		}
		http.Error(w, "delete failed", http.StatusInternalServerError)
		return
	}
	h.audit(r, "admin.invite.delete", strconv.FormatInt(id, 10), "ok")
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) audit(r *http.Request, eventType, actor, outcome string) {
	if h.Audit == nil {
		return
	}
	h.Audit.Log(r.Context(), audit.Event{
		Type:    eventType,
		Actor:   actor,
		IP:      audit.ClientIP(r),
		Outcome: outcome,
	})
}

// GenerateInviteCode returns 16 base32-encoded random characters
// (~80 bits). Uppercase + digits, no padding, no ambiguous chars (`I/O/0/1`
// kept since we use base32 alphabet — practical scanning is fine).
func GenerateInviteCode() (string, error) {
	buf := make([]byte, 10)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

func validateUsername(s string) error {
	if len(s) < 2 || len(s) > 50 {
		return errors.New("username length must be 2-50")
	}
	for _, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.'
		if !ok {
			return errors.New("username may only contain letters, digits, dot, dash, underscore")
		}
	}
	return nil
}

func validatePassword(s string) error {
	if len(s) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	if len(s) > 128 {
		return errors.New("password too long")
	}
	return nil
}

func looksLikeEmail(s string) bool {
	at := strings.IndexByte(s, '@')
	if at <= 0 || at == len(s)-1 {
		return false
	}
	if strings.IndexByte(s[at+1:], '.') < 0 {
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

