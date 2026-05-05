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
	"github.com/alysechen/mochan-linux/server/internal/pty"
	"github.com/alysechen/mochan-linux/server/internal/rss"
	"github.com/alysechen/mochan-linux/server/internal/settings"
	"github.com/alysechen/mochan-linux/server/internal/sshclient"
	"github.com/alysechen/mochan-linux/server/internal/static"
	"github.com/alysechen/mochan-linux/server/internal/sysinfo"
	"github.com/alysechen/mochan-linux/server/internal/trash"
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
		case "run", "serve":
			// fallthrough to runServer below
		default:
			fmt.Fprintf(os.Stderr, "unknown subcommand %q\n", os.Args[1])
			fmt.Fprintln(os.Stderr, "usage: mochan [run|hash-password|gen-secret|version]")
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

	authn := auth.New(cfg.Username, cfg.PasswordHash, cfg.JWTSecret, cfg.TokenTTL)

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

	r.Route("/api", func(api chi.Router) {
		api.Post("/auth/login", loginHandler(authn, cfg, auditLog))
		api.Post("/auth/logout", logoutHandler(auditLog, authn))

		api.Group(func(p chi.Router) {
			p.Use(authn.Middleware)
			p.Get("/me", meHandler)
			p.Route("/app-state", appStateHandler.Mount)
			p.Route("/api-tester", apiTesterHandler.Mount)
			p.Route("/bookmarks", bookmarkHandler.Mount)
			p.Route("/browser", browser.New().Mount)
			p.Route("/downloads", downloadHandler.Mount)
			p.Route("/file-transfer", fileTransferHandler.Mount)
			p.Route("/fs", fsapi.New(auditLog).Mount)
			p.Route("/git", gitHandler.Mount)
			p.Route("/rss", rssHandler.Mount)
			p.Route("/trash", trashHandler.Mount)
			p.Route("/weather", weatherHandler.Mount)
			p.Route("/sys", func(sr chi.Router) {
				sysinfo.New(auditLog).Mount(sr)
				sr.Route("/audit", audit.NewHandler(auditLog).Mount)
			})
			p.Route("/settings", settingsHandler.Mount)
		})
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
		Username string `json:"username"`
		Password string `json:"password"`
	}
	type resp struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
		Username  string    `json:"username"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var body req
		if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if err := a.Verify(body.Username, body.Password); err != nil {
			// Constant-ish delay to slow down brute force.
			time.Sleep(500 * time.Millisecond)
			if al != nil {
				al.Log(r.Context(), audit.Event{
					Type:    "auth.login.fail",
					Actor:   body.Username,
					IP:      audit.ClientIP(r),
					Outcome: "deny",
				})
			}
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}
		token, exp, err := a.Issue(body.Username)
		if err != nil {
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
				Actor:   body.Username,
				IP:      audit.ClientIP(r),
				Outcome: "ok",
			})
		}
		writeJSON(w, http.StatusOK, resp{Token: token, ExpiresAt: exp, Username: body.Username})
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

func meHandler(w http.ResponseWriter, r *http.Request) {
	c, ok := auth.ClaimsFrom(r.Context())
	if !ok {
		http.Error(w, "no claims", http.StatusUnauthorized)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"username": c.Subject,
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

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		log.Printf("%s %s %d %s %s", r.Method, r.URL.Path, ww.Status(), time.Since(start), r.RemoteAddr)
	})
}
