# Operations

## VPS Access And Deployment

- Preferred SSH access from this workstation is `ssh dochenmo`; the alias is configured in `~/.ssh/config` and uses `~/.ssh/dochenmo_ed25519`.
- Production host is the `dochenmo` VPS. The mochan-linux source checkout is `/root/alysechen/github/mochan-linux`.
- Runtime service is `mochan.service`; it runs `/usr/local/bin/mochan run` with working directory `/var/lib/mochan`.
- The service listens on `172.17.0.1:38421`. Nginx Proxy Manager forwards `linux.mochance.xyz` to that bridge address.
- Build tools installed on the VPS: Node and npm under `/usr/local/bin`, Go 1.24.0 under `/usr/local/go` with `go` and `gofmt` symlinked into `/usr/local/bin`.

Use the Git-backed deployment path after a PR has been merged to `main`:

```bash
ssh dochenmo
cd /root/alysechen/github/mochan-linux
git pull --ff-only origin main
git fetch --tags --force origin
version="$(git describe --tags --always --dirty)"
make build VERSION="$version"
install -m 0755 bin/mochan /usr/local/bin/mochan
git restore --worktree server/internal/static/dist/index.html
systemctl restart mochan.service
systemctl is-active mochan.service
curl -fsS http://172.17.0.1:38421/healthz
```

For a browser proxy smoke test without exposing credentials, authenticate through `/api/auth/login`, keep the returned token local to the shell, then request `/api/browser/proxy?url=...` with `Authorization: Bearer <token>`.

## Local Development Backend Target

- Default frontend development proxy target is `http://127.0.0.1:38421`.
- To test a backend on another port, run Vite with `MOCHAN_DEV_TARGET`, for example:

```bash
cd web
MOCHAN_DEV_TARGET=http://127.0.0.1:38422 npm run dev
```

- This affects `/api`, `/ws`, and `/healthz` proxy targets in `web/vite.config.ts`.
