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
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"

	"github.com/alysechen/mochan-linux/server/internal/auth"
	"github.com/alysechen/mochan-linux/server/internal/config"
	"github.com/alysechen/mochan-linux/server/internal/fsapi"
	"github.com/alysechen/mochan-linux/server/internal/pty"
	"github.com/alysechen/mochan-linux/server/internal/static"
	"github.com/alysechen/mochan-linux/server/internal/sysinfo"
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
		api.Post("/auth/login", loginHandler(authn, cfg))
		api.Post("/auth/logout", logoutHandler)

		api.Group(func(p chi.Router) {
			p.Use(authn.Middleware)
			p.Get("/me", meHandler)
			p.Route("/fs", fsapi.New().Mount)
			p.Route("/sys", sysinfo.New().Mount)
		})
	})

	r.Handle("/ws/pty", pty.New(authn))

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

func loginHandler(a *auth.Authenticator, cfg *config.Config) http.HandlerFunc {
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
		writeJSON(w, http.StatusOK, resp{Token: token, ExpiresAt: exp, Username: body.Username})
		_ = cfg
	}
}

func logoutHandler(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "mochan_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
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
