# mochan-linux

A self-hosted, browser-accessible Linux workstation. Single Go binary that
serves a React desktop UI and bridges browser ↔ real Linux (PTY, files,
processes) over WebSocket and REST.

> **Status (v0.4.0):** real terminal, real file system, real process
> manager, real system metrics — all reachable from the browser desktop.
> See [`CHANGELOG.md`](CHANGELOG.md) for the per-phase rundown.

## ⚠️ Security warning — read before deploying

This project, by design, exposes a **real Linux shell** of the host machine to
authenticated browser users. A misconfiguration is the difference between a
personal workstation and a worldwide remote-code-execution endpoint.

**Hard rules:**

- Single user, strong password (≥ 16 chars). Brute-force protection is minimal.
- Always behind HTTPS. Never expose the listen port to the public internet —
  bind to `127.0.0.1` and front it with a reverse proxy that terminates TLS
  (Nginx Proxy Manager, Caddy, Traefik, …).
- `MOCHAN_JWT_SECRET` must be at least 32 random bytes. Rotate if leaked.
- Run the binary as a dedicated non-root user (`mochan`). Grant `NOPASSWD` sudo
  only if you genuinely need package installs from inside the browser.
- Add `fail2ban` for `/api/auth/login` 401s, or an IP allowlist in your proxy.
- Keep the OS patched: `unattended-upgrades` on Ubuntu/Debian.

If any of the above sounds unfamiliar, **do not deploy this on a public
domain.** Use it locally first.

## Features

- **Login screen** gating the desktop (bcrypt + JWT in HttpOnly cookie).
- **Real terminal** in the browser (xterm.js ↔ WebSocket ↔ `bash -l` PTY).
- **Real file system** browser (list, read, write, mkdir, rename, delete,
  upload, download). Permissions enforced by the host OS.
- **Code editor** in the file manager (CodeMirror 6, language by extension).
- **System monitor**: CPU per core, memory, swap, disks, live network rate.
- **Process manager**: search, sort, send `TERM`/`INT`/`HUP`/`KILL`.
- **Single binary deploy**: frontend embedded, no Node runtime on the server.
- **Multi-arch releases**: linux/amd64 and linux/arm64 prebuilt by
  GitHub Actions on every `v*` tag.

## Architecture

```
browser ──HTTPS/WSS──▶ Nginx Proxy Manager ──HTTP/WS──▶ mochan (Go, :38421)
                                                              │
                                                              ├─ /api/auth   (JWT)
                                                              ├─ /api/fs     (Phase 2)
                                                              ├─ /ws/pty     (Phase 1)
                                                              └─ static SPA  (embed.FS)
                                                              │
                                                              ▼
                                                        host Linux
                                                        (bash, files, apt, …)
```

The Go binary embeds the built React frontend, so deployment is a single file
plus `/etc/mochan/config.env`.

## Repo layout

```
mochan-linux/
├── web/        React + Vite + shadcn/ui frontend
├── server/     Go backend (chi, JWT, embed.FS; PTY + FS in later phases)
├── deploy/     systemd unit, install script, NPM proxy notes
├── scripts/    helper scripts (local dev, password rotation, …)
└── Makefile    `make build` produces ./bin/mochan with the UI baked in
```

## Local development

```bash
# 1) frontend on :5173 (proxy /api and /ws to the Go server in vite.config.ts later)
cd web && npm install && npm run dev

# 2) backend on :38421
cd server
export MOCHAN_PASSWORD_HASH="$(printf 'devpassword' | go run ./cmd/mochan hash-password)"
export MOCHAN_JWT_SECRET="$(go run ./cmd/mochan gen-secret)"
go run ./cmd/mochan run
```

Smoke test:

```bash
curl -s http://127.0.0.1:38421/healthz
curl -s -X POST http://127.0.0.1:38421/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"devpassword"}' | jq
```

## Production build

```bash
make release GOOS=linux GOARCH=amd64
# produces ./bin/mochan-linux-amd64 with the frontend embedded
```

## Deployment (Ubuntu/Debian VPS, behind Nginx Proxy Manager)

```bash
# from your workstation
make release
scp ./bin/mochan-linux-amd64 root@HOST:/tmp/mochan
scp ./deploy/install.sh root@HOST:/tmp/install-mochan.sh
scp ./deploy/mochan.service root@HOST:/tmp/mochan.service

# on the VPS
ssh root@HOST 'mv /tmp/mochan.service /tmp/$(dirname /tmp/install-mochan.sh) 2>/dev/null; \
  bash /tmp/install-mochan.sh --binary /tmp/mochan'
```

Then in NPM, add a Proxy Host per [`deploy/npm-proxy-host.md`](deploy/npm-proxy-host.md).

## License

[MIT](LICENSE)
