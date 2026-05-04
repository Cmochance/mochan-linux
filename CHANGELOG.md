# Changelog

All notable changes to this project will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
