package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"

	"github.com/alysechen/mochan-linux/server/internal/accounts"
	"github.com/alysechen/mochan-linux/server/internal/apitester"
	"github.com/alysechen/mochan-linux/server/internal/appstate"
	"github.com/alysechen/mochan-linux/server/internal/audit"
	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/bookmarks"
	"github.com/alysechen/mochan-linux/server/internal/browser"
	"github.com/alysechen/mochan-linux/server/internal/config"
	"github.com/alysechen/mochan-linux/server/internal/downloads"
	"github.com/alysechen/mochan-linux/server/internal/filetransfer"
	"github.com/alysechen/mochan-linux/server/internal/fsapi"
	"github.com/alysechen/mochan-linux/server/internal/gitclient"
	"github.com/alysechen/mochan-linux/server/internal/guiapps"
	"github.com/alysechen/mochan-linux/server/internal/mailclient"
	"github.com/alysechen/mochan-linux/server/internal/pty"
	"github.com/alysechen/mochan-linux/server/internal/rss"
	"github.com/alysechen/mochan-linux/server/internal/settings"
	"github.com/alysechen/mochan-linux/server/internal/sshclient"
	"github.com/alysechen/mochan-linux/server/internal/static"
	"github.com/alysechen/mochan-linux/server/internal/sysinfo"
	"github.com/alysechen/mochan-linux/server/internal/trash"
	"github.com/alysechen/mochan-linux/server/internal/userdb"
	"github.com/alysechen/mochan-linux/server/internal/verify"
	"github.com/alysechen/mochan-linux/server/internal/weather"
)

var version = "0.1.0-dev"

func main() {
	if len(os.Args) >= 2 {
		switch os.Args[1] {
		case "version", "-v", "--version":
			fmt.Println(version)
			return
		case "hash-password":
			if err := cmdHashPassword(); err != nil {
				fail(err)
			}
			return
		case "gen-secret":
			if err := cmdGenSecret(); err != nil {
				fail(err)
			}
			return
		case "invite":
			if err := cmdInvite(os.Args[2:]); err != nil {
				fail(err)
			}
			return
		case "run", "serve":
			// fallthrough to runServer below
		default:
			fmt.Fprintf(os.Stderr, "unknown subcommand %q\n", os.Args[1])
			fmt.Fprintln(os.Stderr, "usage: mochan [run|hash-password|gen-secret|invite|version]")
			os.Exit(2)
		}
	}

	if err := runServer(); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "error:", err)
	os.Exit(1)
}

func cmdHashPassword() error {
	fmt.Fprint(os.Stderr, "password: ")
	pw, err := readSecret()
	if err != nil {
		return err
	}
	if len(pw) < 8 {
		return errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword(pw, 12)
	if err != nil {
		return err
	}
	fmt.Println(string(hash))
	return nil
}

func cmdGenSecret() error {
	buf := make([]byte, 48)
	if _, err := rand.Read(buf); err != nil {
		return err
	}
	fmt.Println(hex.EncodeToString(buf))
	return nil
}

func readSecret() ([]byte, error) {
	if term.IsTerminal(int(syscall.Stdin)) {
		b, err := term.ReadPassword(int(syscall.Stdin))
		fmt.Fprintln(os.Stderr)
		return b, err
	}
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return nil, err
	}
	return []byte(strings.TrimRight(string(b), "\r\n")), nil
}

func runServer() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(cfg.DataDir, 0o750); err != nil {
		return fmt.Errorf("ensure data dir: %w", err)
	}
	db, err := userdb.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open user db: %w", err)
	}
	defer db.Close()
	if err := auth.BootstrapAdmin(context.Background(), db, cfg.Username, cfg.Email, cfg.PasswordHash); err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}

	authn := auth.New(db, cfg.JWTSecret, cfg.TokenTTL)

	verifyCfg := verify.DefaultConfig()
	verifyCfg.APIKey = cfg.ResendAPIKey
	verifyCfg.FromEmail = cfg.ResendFromEmail
	verifySvc := verify.New(db, verifyCfg, nil)
	if !verifySvc.Configured() {
		log.Printf("warning: MOCHAN_RESEND_API_KEY not set — registration emails will fail until configured")
	}

	auditLog, err := audit.New(filepath.Join(cfg.DataDir, "audit.log"))
	if err != nil {
		log.Printf("audit log init failed (continuing without audit): %v", err)
	}
	defer func() {
		if auditLog != nil {
			_ = auditLog.Close()
		}
	}()

	settingsStore, err := settings.NewStore(filepath.Join(cfg.DataDir, "settings.json"))
	if err != nil {
		return fmt.Errorf("settings store: %w", err)
	}
	wallpaperBucket, err := settings.NewBucket(filepath.Join(cfg.DataDir, "wallpapers"))
	if err != nil {
		return fmt.Errorf("wallpaper bucket: %w", err)
	}
	settingsHandler := settings.NewHandler(settingsStore, wallpaperBucket)
	appStateStore, err := appstate.NewStore(filepath.Join(cfg.DataDir, "apps"))
	if err != nil {
		return fmt.Errorf("app state store: %w", err)
	}
	appStateHandler := appstate.NewHandler(appStateStore, auditLog)
	trashStore, err := trash.NewStore(filepath.Join(cfg.DataDir, "trash"))
	if err != nil {
		return fmt.Errorf("trash store: %w", err)
	}
	trashHandler := trash.NewHandler(trashStore, auditLog)
	downloadManager, err := downloads.NewManager(filepath.Join(cfg.DataDir, "downloads"))
	if err != nil {
		return fmt.Errorf("download manager: %w", err)
	}
	downloadHandler := downloads.NewHandler(downloadManager, auditLog)
	apiTesterHandler := apitester.New(auditLog)
	rssStore, err := rss.NewStore(filepath.Join(cfg.DataDir, "rss"))
	if err != nil {
		return fmt.Errorf("rss store: %w", err)
	}
	rssHandler := rss.NewHandler(rssStore, auditLog)
	gitStore, err := gitclient.NewStore(filepath.Join(cfg.DataDir, "git"))
	if err != nil {
		return fmt.Errorf("git store: %w", err)
	}
	gitHandler := gitclient.NewHandler(gitStore, auditLog)
	bookmarkStore, err := bookmarks.NewStore(filepath.Join(cfg.DataDir, "bookmarks"))
	if err != nil {
		return fmt.Errorf("bookmarks store: %w", err)
	}
	bookmarkHandler := bookmarks.NewHandler(bookmarkStore, auditLog)
	weatherCache, err := weather.NewCache(filepath.Join(cfg.DataDir, "weather"))
	if err != nil {
		return fmt.Errorf("weather cache: %w", err)
	}
	weatherHandler := weather.NewHandler(weatherCache, auditLog)
	fileTransferHandler := filetransfer.NewHandler(auditLog)
	mailHandler := mailclient.NewHandler(auditLog)
	guiAppsManager := guiapps.NewManager()
	guiAppsHandler := guiapps.NewHandler(guiAppsManager, auditLog)

	staticFS, err := static.FS()
	if err != nil {
		return err
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(loggingMiddleware)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	accountsHandler := &accounts.Handler{
		DB:        db,
		Auth:      authn,
		Verify:    verifySvc,
		Audit:     auditLog,
		InviteTTL: cfg.InviteTTL,
	}

	r.Route("/api", func(api chi.Router) {
		api.Post("/auth/login", loginHandler(authn, cfg, auditLog))
		api.Post("/auth/logout", logoutHandler(auditLog, authn))
		accountsHandler.MountPublic(api)

		api.Group(func(p chi.Router) {
			p.Use(authn.Middleware)
			p.Get("/me", meHandler)
			p.Post("/auth/change-password", changePasswordHandler(authn, db, auditLog))
			accountsHandler.MountAdmin(p)
			p.Route("/app-state", appStateHandler.Mount)
			p.Route("/api-tester", apiTesterHandler.Mount)
			p.Route("/bookmarks", bookmarkHandler.Mount)
			p.Route("/browser", browser.New().Mount)
			p.Route("/downloads", downloadHandler.Mount)
			p.Route("/file-transfer", fileTransferHandler.Mount)
			p.Route("/fs", fsapi.New(auditLog).Mount)
			p.Route("/git", gitHandler.Mount)
			p.Route("/mail", mailHandler.Mount)
			p.Route("/rss", rssHandler.Mount)
			p.Route("/trash", trashHandler.Mount)
			p.Route("/weather", weatherHandler.Mount)
			p.Route("/sys", func(sr chi.Router) {
				sysinfo.New(auditLog).Mount(sr)
				sr.Route("/audit", audit.NewHandler(auditLog).Mount)
			})
			p.Route("/settings", settingsHandler.Mount)
			p.Route("/gui", guiAppsHandler.MountAdmin)
		})
	})

	// xpra HTML5 reverse proxy lives OUTSIDE /api so the iframe-loaded
	// content (HTML, JS, CSS, websocket) sees its own URL space cleanly.
	// We still apply the same auth middleware as /api/* — it's mounted
	// here as a sibling group on the root router.
	r.Group(func(g chi.Router) {
		g.Use(authn.Middleware)
		guiAppsHandler.MountProxy(g)
	})

	ptyHandler := pty.New(authn, 5*time.Minute)
	defer ptyHandler.Close()
	r.Handle("/ws/pty", ptyHandler)
	r.Handle("/ws/ssh", sshclient.New(authn, auditLog))

	r.Handle("/*", spaHandler(staticFS))

	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           r,
		ReadHeaderTimeout: 15 * time.Second,
	}

	idleClosed := make(chan struct{})
	go func() {
		sigs := make(chan os.Signal, 1)
		signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
		<-sigs
		log.Println("shutting down")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
		close(idleClosed)
	}()

	log.Printf("mochan-linux %s listening on %s", version, cfg.Listen)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	<-idleClosed
	return nil
}

func loginHandler(a *auth.Authenticator, cfg *config.Config, al *audit.Logger) http.HandlerFunc {
	type req struct {
		// Identifier accepts username or email. Username is kept for
		// backward compatibility with older clients.
		Identifier string `json:"identifier"`
		Username   string `json:"username"`
		Password   string `json:"password"`
	}
	type resp struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
		Username  string    `json:"username"`
		Email     string    `json:"email"`
		Role      string    `json:"role"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var body req
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		ident := body.Identifier
		if ident == "" {
			ident = body.Username
		}
		result, err := a.Verify(r.Context(), ident, body.Password)
		if err != nil {
			// Constant-ish delay to slow down brute force.
			time.Sleep(500 * time.Millisecond)
			if al != nil {
				al.Log(r.Context(), audit.Event{
					Type:    "auth.login.fail",
					Actor:   ident,
					IP:      audit.ClientIP(r),
					Outcome: "deny",
				})
			}
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		token, exp, issueErr := a.Issue(result.User)
		if issueErr != nil {
			http.Error(w, "issue failed", http.StatusInternalServerError)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "mochan_token",
			Value:    token,
			Path:     "/",
			Expires:  exp,
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
		})
		if al != nil {
			al.Log(r.Context(), audit.Event{
				Type:    "auth.login.success",
				Actor:   result.User.Username,
				IP:      audit.ClientIP(r),
				Outcome: "ok",
			})
		}
		writeJSON(w, http.StatusOK, resp{
			Token:     token,
			ExpiresAt: exp,
			Username:  result.User.Username,
			Email:     result.User.Email,
			Role:      result.User.Role,
		})
		_ = cfg
	}
}

func logoutHandler(al *audit.Logger, a *auth.Authenticator) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		actor := ""
		if c, err := r.Cookie("mochan_token"); err == nil && c.Value != "" {
			if claims, perr := a.Parse(c.Value); perr == nil {
				actor = claims.Subject
			}
		}
		http.SetCookie(w, &http.Cookie{
			Name:     "mochan_token",
			Value:    "",
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   true,
			SameSite: http.SameSiteLaxMode,
		})
		if al != nil {
			al.Log(r.Context(), audit.Event{
				Type:    "auth.logout",
				Actor:   actor,
				IP:      audit.ClientIP(r),
				Outcome: "ok",
			})
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func changePasswordHandler(a *auth.Authenticator, db *userdb.DB, al *audit.Logger) http.HandlerFunc {
	type req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		c, ok := auth.ClaimsFrom(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var body req
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if len(body.NewPassword) < 8 || len(body.NewPassword) > 128 {
			http.Error(w, "new password length must be 8-128", http.StatusBadRequest)
			return
		}
		if body.CurrentPassword == body.NewPassword {
			http.Error(w, "new password must differ from current", http.StatusBadRequest)
			return
		}
		// Re-verify current password against the user identified by the JWT.
		// Use Subject (username) so the lookup goes through the same code path
		// as login — keeps inactive-account behavior consistent.
		if _, err := a.Verify(r.Context(), c.Subject, body.CurrentPassword); err != nil {
			time.Sleep(500 * time.Millisecond)
			if al != nil {
				al.Log(r.Context(), audit.Event{
					Type:    "auth.password.change",
					Actor:   c.Subject,
					IP:      audit.ClientIP(r),
					Outcome: "deny",
				})
			}
			http.Error(w, "current password incorrect", http.StatusUnauthorized)
			return
		}
		hash, err := auth.HashPassword(body.NewPassword)
		if err != nil {
			http.Error(w, "hash failed", http.StatusInternalServerError)
			return
		}
		if err := db.UpdatePassword(r.Context(), c.UID, hash); err != nil {
			http.Error(w, "update failed", http.StatusInternalServerError)
			return
		}
		if al != nil {
			al.Log(r.Context(), audit.Event{
				Type:    "auth.password.change",
				Actor:   c.Subject,
				IP:      audit.ClientIP(r),
				Outcome: "ok",
			})
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		http.Error(w, "no claims", http.StatusUnauthorized)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"username": c.Subject,
		"role":     c.Role,
		"uid":      c.UID,
		"expires":  c.ExpiresAt,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// spaHandler serves static assets and falls back to index.html for client routes.
func spaHandler(root fs.FS) http.Handler {
	fsrv := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(root, path); err != nil {
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			fsrv.ServeHTTP(w, r2)
			return
		}
		fsrv.ServeHTTP(w, r)
	})
}

// cmdInvite implements `mochan invite create [--email=...]`. The DB path
// comes from the same config the server uses, so the server doesn't need to
// be running. The created code is printed to stdout for the operator to
// hand to the invitee.
func cmdInvite(args []string) error {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: mochan invite create [--email=address]")
		return errors.New("subcommand required")
	}
	switch args[0] {
	case "create":
		return cmdInviteCreate(args[1:])
	case "list":
		return cmdInviteList()
	default:
		return fmt.Errorf("unknown invite subcommand %q", args[0])
	}
}

func cmdInviteCreate(args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	email := ""
	for _, a := range args {
		switch {
		case strings.HasPrefix(a, "--email="):
			email = strings.TrimPrefix(a, "--email=")
		case a == "--email":
			// next arg
			continue
		}
	}
	db, err := userdb.Open(cfg.DBPath)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()

	ctx := context.Background()
	if err := auth.BootstrapAdmin(ctx, db, cfg.Username, cfg.Email, cfg.PasswordHash); err != nil {
		return err
	}
	users, err := db.ListUsers(ctx)
	if err != nil || len(users) == 0 {
		return fmt.Errorf("no users in db; run the server once before issuing invites")
	}
	var adminID int64
	for _, u := range users {
		if u.Role == "admin" {
			adminID = u.ID
			break
		}
	}
	if adminID == 0 {
		adminID = users[0].ID
	}

	code, err := accounts.GenerateInviteCode()
	if err != nil {
		return err
	}
	inv, err := db.CreateInvite(ctx, code, email, adminID, cfg.InviteTTL)
	if err != nil {
		return err
	}
	fmt.Println(inv.Code)
	if email != "" {
		fmt.Fprintf(os.Stderr, "(bound to %s, expires %s)\n", inv.Email, inv.ExpiresAt.Format(time.RFC3339))
	} else {
		fmt.Fprintf(os.Stderr, "(any email, expires %s)\n", inv.ExpiresAt.Format(time.RFC3339))
	}
	return nil
}

func cmdInviteList() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	db, err := userdb.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer db.Close()
	invs, err := db.ListInvites(context.Background())
	if err != nil {
		return err
	}
	for _, inv := range invs {
		used := "open"
		if inv.Used() {
			used = "used"
		} else if time.Now().After(inv.ExpiresAt) {
			used = "expired"
		}
		bound := inv.Email
		if bound == "" {
			bound = "(any)"
		}
		fmt.Printf("%s\t%s\t%s\t%s\n", inv.Code, used, bound, inv.ExpiresAt.Format(time.RFC3339))
	}
	return nil
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		log.Printf("%s %s %d %s %s", r.Method, r.URL.Path, ww.Status(), time.Since(start), r.RemoteAddr)
	})
}
