# Changelog

All notable changes to this project will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-05-06

Patch release focused on documentation and release readiness.

### Added

- Real README preview screenshots for the desktop, app launcher, File Manager,
  Terminal, Settings, and Browser start page.
- README app backend completion summary through P15, with the remaining
  server-backed app work clearly separated from low-priority local utilities
  and games.
- v1.0.1 release notes under `docs/release-notes-v1.0.1.md`.

### Notes

- No runtime application code changes are included in this patch. The current
  backend implementation state is unchanged from the completed P0-P15 work.

## [1.0.0] — 2026-05-04

First stable release. The browser-as-Linux-desktop concept hits feature
parity with the original goal: a single Go binary deployed behind a
reverse proxy, login-gated, exposing the host machine's terminal,
filesystem, processes and metrics through a water-ink themed React
desktop. Reachable from any device including mobile.

This release does not add new code beyond v0.9.0 — it is a stability
marker, README polish, and CHANGELOG audit. Future minor releases
(`v1.x`) ship feature work; patches (`v1.0.x`) ship fixes.

### What is in v1.0.0

| Layer | Capability |
|---|---|
| Auth | bcrypt + JWT in HttpOnly cookie, login screen gate, logout endpoint, audit on `auth.login.{success,fail}` and `auth.logout` |
| Terminal | WebSocket ↔ creack/pty bridge, xterm.js front-end, persistent named sessions with 256 KiB ring buffer, auto-reconnect with jittered backoff, 5-minute idle reaper |
| Filesystem | `/api/fs/*` REST (list/read/write/mkdir/move/delete/upload/download/stat) running as the OS user, no chroot, perms enforced by the host kernel |
| Editor | CodeMirror 6 with extension-driven language detection (JS/TS/JSON/Python/Go/HTML/CSS/Markdown/YAML, …) |
| System | `/api/sys/{stat,processes,kill}` powered by gopsutil, real-time SystemMonitor and TaskManager apps |
| Audit | JSONL append-only log at `<DataDir>/audit.log` with rotation, AuditLog viewer app with filters and rolling counters |
| Settings | Server-side persisted theme / language / wallpaper, wallpaper bucket on disk with upload + delete |
| Inter-app | FileManager double-click routes by extension to MarkdownEditor / ImageViewer / TextEditor; apps load + save via `/api/fs` |
| Mobile | Below 768 px viewport: every window is fullscreen between StatusBar and Dock, drag/resize disabled, traffic-light buttons enlarged, Dock scrolls horizontally |
| Distribution | Single binary with `embed.FS`-injected frontend, multi-arch (amd64 + arm64) GitHub Actions release on every `v*` tag, consolidated SHA256SUMS file |

### What is intentionally out of scope

- **Multi-user.** This is a single-user system by design.
- **Listen-port toggle in UI.** Editing `/etc/mochan/config.env` + a
  `systemctl restart mochan` is the right interface for that.
- **Password rotation in UI.** Same constraint.
- **2FA / OAuth / SSO.** Single password is the only auth.
- **Built-in IPS / fail2ban.** Audit is for the forensic trail; rate
  limiting and IP blocking belong in the reverse proxy.
- **Cross-restart PTY persistence.** Sessions die with the server
  process; tmux remains the right answer.
- **PWA / offline mode.** No service worker, no installable manifest.

### Versioning policy from here

- `v1.x.0` (minor): backward-compatible feature work.
- `v1.0.x` (patch): bug fixes, security fixes, no API change.
- `v2.0.0` would only be triggered by an intentional break (e.g. shifting
  away from single-user) — not planned at the moment.

## [0.9.0] — 2026-05-04

Phase 8 — real Settings page backed by server persistence + wallpaper bucket.

### Added

- `internal/settings`: `Store` (atomic JSON write to
  `<DataDir>/settings.json`, 0640) and `Bucket` for user-uploaded
  wallpapers under `<DataDir>/wallpapers/`. Endpoints:
  - `GET /api/settings/` → `{theme, language, wallpaper}`
  - `PATCH /api/settings/` → merge keys, validate enum values
  - `GET /api/settings/wallpapers/` → list bundled + user
  - `POST /api/settings/wallpapers/` → multipart upload (extension
    whitelist + filename guard against path traversal)
  - `GET /api/settings/wallpapers/{name}` → serve user-uploaded image
  - `DELETE /api/settings/wallpapers/{name}` → remove user wallpaper
- `lib/settings.ts` typed client + `wallpaperUrl(id)` helper that
  routes bundled IDs (`wallpaper-…`) to the static bundle and any other
  ID to `/api/settings/wallpapers/<name>`.
- `hooks/use-settings-sync.ts`: bootstraps zustand stores from
  `/api/settings/` after auth, then subscribes to local mutations and
  writes back debounced (300 ms). Server is the cross-device source of
  truth; localStorage acts as a warm cache so the desktop renders
  before the round-trip.
- `apps/Settings.tsx` rewritten as a tabbed page:
  - **外观**: theme buttons (水墨 / 夜色 / 宣纸) + wallpaper grid with
    upload-and-delete UI for user wallpapers.
  - **语言**: 中文 / English toggle.
  - **关于**: app branding, GitHub / Releases links, live host info
    fed by `/api/sys/stat` (hostname / OS / kernel / arch / uptime /
    CPU / memory / load / disks).

### Changed

- `Desktop`, `LockScreen`, `AuthGate` now resolve the wallpaper URL via
  `wallpaperUrl()` so user-uploaded images render alongside the
  bundled set.
- `WallpaperId` in `useDesktopStore` widened from a literal union to
  `string` so user-uploaded filenames are valid IDs.

### Notes

- "端口" intentionally is **not** a UI knob. Listening port is set in
  `/etc/mochan/config.env` and changing it requires `systemctl restart
  mochan` plus an updated reverse-proxy upstream — wrong layer for an
  in-app toggle.
- The settings document does **not** include the password. Password
  rotation is still `mochan hash-password` → edit `config.env` →
  `systemctl restart mochan`.

## [0.8.0] — 2026-05-04

Phase 7 — terminal session persistence and auto-reconnect.

### Changed

- `internal/pty` decouples PTY lifetime from any single WebSocket. A
  process-wide `Manager` owns a pool of named `Session`s; each Session
  keeps the PTY, a 256 KiB ring buffer of recent output, and a list of
  active subscribers (typically just one client). When all clients
  detach, an idle timer starts; sessions with zero subscribers for more
  than 5 minutes are reaped.
- `/ws/pty` accepts an opaque `?session=<id>` query parameter. If the
  session exists, the new client attaches to it and receives the entire
  ring buffer as a binary replay. If not, a new session is created
  bound to that ID.
- The first frame after a successful upgrade is now a JSON control
  message:
  ```
  {"type":"attached","session_id":"<id>","cols":N,"rows":M,"buffer_len":B}
  ```
  followed by the `B` bytes of binary replay.
- Frontend `apps/Terminal.tsx` generates a per-component random session
  ID, includes it in the WebSocket URL, and on close auto-reconnects
  with jittered exponential backoff (600 ms → 8 s cap, multiplier 1.6).
  After a successful reconnect, an `[已重新连接]` notice is written
  inline to the terminal.

### Notes

- Session IDs are not persisted to localStorage on purpose: opening
  multiple Terminal windows in the same browser creates independent
  shells, and a hard browser refresh starts a fresh shell. tmux/screen
  remain the right tool for "I closed my laptop and want my shell back
  next morning" scenarios.
- The 5-minute idle TTL kicks in only when *no* clients are attached.
  Long-running TUIs (htop, vim) are unaffected — the PTY produces
  output continuously, but the timer only counts no-subscriber wall
  clock time.
- Reaper logs `pty: reaping idle session <id>` in the systemd journal.

## [0.7.0] — 2026-05-04

Phase 6 — mobile / touch usability.

### Added

- `WindowFrame` mobile mode: when the viewport is below 768 px wide,
  every window is forced to fill the area between StatusBar (top, 28 px)
  and Dock (bottom, 56 px). Drag and resize are disabled, resize handles
  are not rendered. The 12 px traffic-light buttons grow to 22 px so they
  are reachable as touch targets.
- `Dock` mobile mode: the bar shrinks to 56 px tall, takes full viewport
  width, and scrolls horizontally when the icon list overflows. Desktop
  behaviour (centered, max-width 90vw) is unchanged.

### Notes

- Tested by squeezing Chrome's responsive viewport to 390 × 844 (iPhone
  14). Login screen, terminal, file manager, audit log, and system
  monitor all reachable on a phone-sized viewport. xterm.js handles touch
  selection out of the box; on-screen keyboards trigger `term.focus()`
  via tap.
- This is a viability pass, not a polished mobile UX. `Desktop` still
  renders icons designed for mouse drag-and-drop, and the `AppLauncher`
  category grid was tuned for laptop widths. Both are usable but
  cramped — proper mobile UX is later.

## [0.6.0] — 2026-05-04

Phase 5 — inter-app routing. Double-clicking a file in FileManager now
opens the right app instead of always falling back to the CodeMirror
modal. Apps load their content directly from `/api/fs`.

### Added

- `lib/openFile.ts`: extension-driven router. Maps:
  - `.md` / `.markdown` → MarkdownEditor
  - `.jpg` / `.jpeg` / `.png` / `.gif` / `.webp` / `.svg` / `.bmp` /
    `.ico` / `.avif` → ImageViewer
  - `.txt` / `.log` / `.conf` / `.cfg` / `.ini` / `.env` and common
    source-code extensions (`.go` / `.py` / `.rs` / `.js` / `.ts` /
    `.json` / …) → TextEditor
  - everything else falls back to the existing FileManager CodeMirror
    modal (text) or download (binary).
- `useWindowStore.WindowData.payload`: optional bag passed at open time
  so apps can read the file path that triggered the launch.
  `usePayloadPath(windowId)` is the helper.
- TextEditor / MarkdownEditor / ImageViewer now opt in: when launched
  with a payload, they fetch via `/api/fs/read` (or `downloadURL` for
  images) and override their default content. Save buttons in
  TextEditor and MarkdownEditor, when there is a remote path, write
  back via `/api/fs/write` instead of triggering a browser download.

### Notes

- Apps launched without a payload (from the start menu / Dock) keep
  their original behaviour unchanged. The remote-fs path is purely
  additive.
- ImageViewer gets a single-image preview when opened from FileManager;
  drag-and-drop and the existing local-file mode still work.

## [0.5.0] — 2026-05-04

Phase 4 — security audit log.

### Added

- `internal/audit` package: append-only JSONL writer at
  `<DataDir>/audit.log` (default `/var/lib/mochan/audit.log`), 0640 perms,
  rotates to `.1` at 10 MiB. Nil-safe so audit-write failures never break
  the underlying operation.
- Audit events now captured: `auth.login.success`, `auth.login.fail`,
  `auth.logout`, `fs.write`, `fs.mkdir`, `fs.delete`, `fs.move`,
  `fs.upload`, `sys.kill`. Each row carries `time`, `actor`, `ip`,
  `outcome` (`ok` / `deny`), and event-specific `detail`.
- `GET /api/sys/audit` tail endpoint with `?limit=` and `?type=` filters.
  Returns newest-first, transparently merges current file + last
  rotation.
- `apps/AuditLog.tsx`: live audit viewer, type-filtered dropdown,
  5 s auto-refresh, login-success / login-fail counters in the toolbar.
  Registered in the system-tools category as "审计日志".
- Real client IP attribution: prefers `CF-Connecting-IP` →
  `X-Real-IP` → first hop of `X-Forwarded-For` → `RemoteAddr`. Verified
  on the `linux.mochance.xyz` deployment (Cloudflare → NPM → mochan).

### Removed

- `Co-Authored-By: Claude` trailer rewritten out of the v0.1.0 → v0.4.0
  history. Repository contributor graph now correctly shows Cmochance
  alone.

## [0.4.0] — 2026-05-04

Phase 3 — system observability + editor upgrade + release pipeline.

### Added

- `/api/sys/stat`: hostname, kernel, OS, uptime, load average, per-core CPU,
  memory, swap, mounted disks (total/used/percent), aggregate net counters.
  Backed by gopsutil v4.
- `/api/sys/processes` + `/api/sys/kill`: live process list (PID, user,
  name, CPU%, RSS, threads, status, cmdline) and a kill endpoint that
  accepts `TERM`/`INT`/`HUP`/`KILL` (refuses pid ≤ 1).
- `apps/SystemMonitor.tsx`: real-time host dashboard, polls `/api/sys/stat`
  every 2 s; bars for CPU per core, memory, swap, every disk; rolling
  network rate.
- `apps/TaskManager.tsx`: real process table — search, sort by CPU/RSS/PID/
  name, kill dialog with signal selector.
- `components/CodeEditor.tsx`: CodeMirror 6 with one-dark theme and
  language detection by file extension (JS/TS/JSON/Python/HTML/CSS/Markdown/
  YAML). FileManager file editing now uses it instead of a textarea.
- `components/StatusBar.tsx`: user dropdown showing the logged-in account
  with a logout entry that hits `/api/auth/logout` and clears the cookie.
- `.github/workflows/release.yml`: tag-driven multi-arch release (linux
  amd64 + arm64), uploads binaries to the GitHub release.
- `CHANGELOG.md` (this file).

### Changed

- README documents Phase 1–3 features and upgrade procedure.

## [0.3.0] — 2026-05-04

Phase 2 — file system REST API + browser file manager.

### Added

- `/api/fs/*` endpoints: `home`, `list`, `read`, `write`, `mkdir`, `delete`,
  `move`, `upload`, `download`, `stat`. All run as the OS user that owns the
  mochan process; permission errors surface as 403, not-found as 404,
  conflicts as 409, oversize as 413.
- `apps/FileManager.tsx` rewritten over `lib/fs.ts`: breadcrumb path bar,
  upload, mkdir, rename, delete, double-click text files into an editor
  modal with dirty-state save.
- `lib/fs.ts`: typed client wrappers for the FS API.

## [0.2.0] — 2026-05-03

Phase 1 — real terminal.

### Added

- `/ws/pty` WebSocket endpoint (coder/websocket + creack/pty) that spawns
  `bash -l` as the service user and bridges stdin/stdout to the browser.
  Accepts a JSON resize control message.
- `apps/Terminal.tsx` rewritten with `@xterm/xterm` + fit addon. Connects
  same-origin via the auth cookie; supports xterm-256color and UTF-8.

## [0.1.1] — 2026-05-03

### Added

- `components/AuthGate.tsx`: login screen that gates the entire desktop.
  Calls `/api/me` on load; shows username/password form on 401; renders
  children only after a successful `/api/auth/login`.
- `/api/auth/logout`: clears the HttpOnly auth cookie.

### Fixed

- Frontend previously rendered the desktop without checking auth state,
  exposing the UI shell to anyone hitting the public domain. The backend
  was already auth-gated; the gap was purely client-side.

## [0.1.0] — 2026-05-03

Phase 0 — scaffold + auth + deploy pipeline.

### Added

- Go backend (chi + JWT + bcrypt) with `embed.FS`-bundled React frontend.
- `mochan` CLI subcommands: `run`, `hash-password`, `gen-secret`, `version`.
- `/api/auth/login`, `/api/me`, `/healthz`.
- systemd unit + installer script + Nginx Proxy Manager integration notes.
- React + Vite + shadcn frontend skeleton (carried over from the original
  cosmetic Linux-desktop UI).
