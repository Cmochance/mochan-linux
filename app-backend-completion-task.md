# App Backend Completion Task

## Goal

Push mochan-linux from a desktop UI with a few real backend integrations to a coherent server-backed workstation. This task tracks every app that still has simulated, browser-local, or partial backend behavior, ordered by implementation value and dependency risk.

## Current Status

- Status: in progress
- Started: 2026-05-05
- Source of truth: current `main` code scan of `web/src/apps`, `web/src/lib`, and `server/internal`.

## Current Backend Surface

Already server-backed enough to exclude from the missing-backend queue:

- File Manager: `/api/fs/*`.
- Terminal: `/ws/pty`.
- System Monitor: `/api/sys/stat`.
- Task Manager: `/api/sys/processes` and `/api/sys/kill`.
- Audit Log: `/api/sys/audit/`.
- Settings: `/api/settings/` and `/api/settings/wallpapers/*`.
- Browser: `/api/browser/proxy`.
- Text Editor: File Manager-launched files and standalone open/save/save-as use `/api/fs`.
- Markdown Editor: File Manager-launched files and standalone open/save/save-as use `/api/fs`; HTML export can be written to a server path.
- Image Viewer: File Manager-launched images load through `/api/fs/download`; transformed images can be saved to server paths through `/api/fs/upload`.
- Download Manager: `/api/downloads` creates, lists, cancels, retries, and deletes server-side download jobs; completed files are opened through `/api/fs/download`.
- API Tester: `/api/api-tester/run` executes real HTTP requests from the server host, and request history is persisted through `/api/app-state`.
- RSS Reader: `/api/rss` stores feed subscriptions, refreshes RSS/Atom feeds from the server, caches articles, and persists read/starred state.

Partially server-backed and still in scope:

- None in the first P0-P2 group. Later apps still have browser-local state and are tracked in the task tree below.

## Ordering Rules

1. Fix misleading or destructive OS-level behavior first. If the UI looks like it touches real Linux state, it must use the real backend.
2. Build shared backend foundations before migrating many local-only apps one by one.
3. Prioritize server-side network features that benefit from the VPS network and avoid browser CORS limits.
4. Defer high-risk protocol clients until credential handling, allowlists, and audit logging are designed.
5. Keep pure calculators, formatters, and games last unless they need cross-device sync or leaderboards.

## Task Tree

- [x] P0 Backend foundations and contracts.
- [x] P1 Trash: real server-side trash, restore, and permanent delete.
- [x] P2 Finish file-backed editors and viewers.
- [x] P3 Download Manager: real server-side download tasks.
- [x] P4 API Tester: real server-side HTTP request runner.
- [x] P5 RSS Reader: real feed subscriptions and article cache.
- [ ] P6 Git Client: real repository status, diff, branch, and commit operations.
- [ ] P7 SSH Client: real SSH sessions through the server.
- [ ] P8 FTP Client: real SFTP/FTP file transfer.
- [ ] P9 Bookmarks: persistent bookmark store integrated with Browser.
- [ ] P10 Weather: real weather provider and server cache.
- [ ] P11 Email Client: real IMAP/SMTP account support.
- [ ] P12 Chat App: define and implement real messaging scope.
- [ ] P13 Notes: server-backed notes.
- [ ] P14 Calendar: server-backed events.
- [ ] P15 Notebook: server-backed notebooks and rich notes.
- [ ] P16 Spreadsheet: server-backed workbook files.
- [ ] P17 Mind Map: server-backed mind-map documents.
- [ ] P18 Presentation: server-backed slide documents.
- [ ] P19 Pomodoro: server-backed sessions and history.
- [ ] P20 Habit Tracker: server-backed habits and completion history.
- [ ] P21 Dictionary: server-backed favorites, history, and optional dictionary source.
- [ ] P22 Translator: server-backed translation runner and history.
- [ ] P23 Photo Album: server-backed media library.
- [ ] P24 Camera: save captured photos into the server media library.
- [ ] P25 Voice Recorder: save recordings into the server media library.
- [ ] P26 Music Player: server-backed music library.
- [ ] P27 Video Player: server-backed video library.
- [ ] P28 PDF Reader: open and track server-side PDFs.
- [ ] P29 Paint: save drawings as server-side image files.
- [ ] P30 Low-priority sync for pure local tools and games.

## Detailed Order

### P0 Backend Foundations And Contracts

Create shared backend primitives before app-specific migrations:

- Per-user app data store under `DataDir`, for example `<DataDir>/apps/<app-id>/state.json`.
- Optional document/object store for app files that are not plain Linux files yet.
- Consistent REST conventions for list/get/create/update/delete.
- Audit event naming for app data writes, protocol connections, downloads, and external requests.
- Frontend client helpers in `web/src/lib` so apps do not invent ad hoc API calls.

Acceptance:

- New backend APIs are authenticated under `/api`.
- State writes are atomic enough to avoid corrupt JSON on restart.
- Server tests cover happy path and malformed input.
- Frontend build passes after adding shared clients.

### P1 Trash

Reason for priority: Trash currently implies real file recovery but only edits `localStorage` and an old fake file-system key.

Target behavior:

- File Manager delete moves files into a server-side trash area instead of immediate removal.
- Trash app lists deleted files from backend metadata.
- Restore moves files back to original path when possible.
- Permanent delete removes trash payload and metadata.
- All operations write audit events.

Suggested backend:

- `/api/trash/list`
- `/api/trash/restore`
- `/api/trash/delete`
- `/api/trash/empty`

### P2 File-Backed Editors And Viewers

Apps:

- Text Editor.
- Markdown Editor.
- Image Viewer.

Target behavior:

- Standalone open/save/save-as flows write to `/api/fs`.
- File Manager-launched mode keeps the existing direct file flow.
- Image Viewer can save transformed images or exported copies to server paths.

### P3 Download Manager

Reason for priority: it is currently one of the most visibly fake network apps.

Target behavior:

- Server downloads URLs from the VPS network.
- Progress, speed, completion, failure, pause/cancel state are real task state.
- Completed files are saved under a configured downloads directory.
- Large downloads do not block the HTTP request handler.

Suggested backend:

- `/api/downloads`
- `/api/downloads/{id}`
- `/api/downloads/{id}/cancel`
- `/api/downloads/{id}/retry`

Implementation note:

- Pause/resume is deferred until server-side Range support and partial-file validation are implemented. This phase intentionally exposes only real create, progress, cancel, retry, delete, and open-file behavior.

### P4 API Tester

Reason for priority: server-side HTTP runner avoids browser CORS and matches the new Browser proxy direction.

Target behavior:

- Execute real HTTP requests from the server.
- Support method, URL, headers, body, timeout, and response inspection.
- Block cloud metadata and other disallowed targets using the same network guardrails as Browser proxy.
- Store request history through the app data store.

Implementation note:

- P4 introduced shared server-side network guardrails in `server/internal/netguard`; Browser, Download Manager, and API Tester now use the same guarded HTTP client direction.

### P5 RSS Reader

Target behavior:

- Store feed subscriptions server-side.
- Fetch and parse RSS/Atom from the server.
- Cache articles and unread/starred state.
- Support refresh all and per-feed refresh.

Implementation note:

- P5 uses a dedicated RSS backend because feed refresh, XML parsing, article cache trimming, and read/star state need app-specific behavior beyond generic app-state.

### P6 Git Client

Reason for priority: this app should operate on real repositories if it appears in a Linux workstation.

Target behavior:

- Allow configured repository roots only.
- Show status, branch, log, staged/unstaged files, and diffs from `git`.
- Support stage/unstage, commit, branch switch/create, pull/fetch, and merge only after explicit UI confirmation.
- Never expose secrets from remotes, env files, or credential helpers in UI logs.

### P7 SSH Client

Target behavior:

- Real SSH sessions proxied through the backend, likely WebSocket-based.
- Credentials are not stored by default.
- Host key policy is explicit and visible.
- Session transcript and connection attempts are audit logged.

Security prerequisite:

- Decide whether this app is allowed at all on a public single-user workstation, because it expands the service into a general SSH jump box.

### P8 FTP Client

Target behavior:

- Prefer SFTP first; plain FTP can be optional or disabled by default.
- Real remote listing, upload, download, rename, delete, and transfer progress.
- Use the same credential policy as SSH Client.

### P9 Bookmarks

Target behavior:

- Persist bookmarks and folders server-side.
- Connect Browser star/bookmark actions to the same store.
- Import/export JSON through the backend.

### P10 Weather

Target behavior:

- Query a real provider from the backend.
- Cache by location and time window.
- Keep provider keys, if any, on the server only.

Low-risk provider option:

- Open-Meteo can provide weather without a frontend secret.

### P11 Email Client

Target behavior:

- Real IMAP inbox/folders and SMTP send.
- Server-side account configuration and optional encrypted credential storage.
- Attachments flow through the server file system.

Security prerequisite:

- Decide whether credentials are session-only or stored on disk. Do not implement stored mail credentials without an explicit encryption and rotation plan.

### P12 Chat App

Scope decision required before implementation:

- Option A: local single-user message notebook with persistence.
- Option B: multi-user self-hosted chat inside this mochan-linux instance.
- Option C: connector to an external service.

Default recommendation:

- Implement only Option A or defer until the product direction is clear.

### P13 Notes

Target behavior:

- Replace `localStorage` with server-backed CRUD.
- Keep pinned/color/search behavior.
- Optional export to plain files under a notes directory.

### P14 Calendar

Target behavior:

- Server-backed events.
- Import/export `.ics`.
- Optional reminder scheduling later.

### P15 Notebook

Target behavior:

- Server-backed notebooks, notes, tags, archived state, and rich text content.
- Migration path from `localStorage`.

### P16 Spreadsheet

Target behavior:

- Server-backed workbook documents.
- Save/load/import/export.
- Keep formula behavior client-side initially unless a real calculation engine is introduced later.

### P17 Mind Map

Target behavior:

- Server-backed mind-map documents.
- Export/import JSON.
- Optional export PNG/SVG later.

### P18 Presentation

Target behavior:

- Server-backed slide decks.
- Export/import JSON first.
- PPTX export is a later enhancement, not part of the first backend pass.

### P19 Pomodoro

Target behavior:

- Server-backed settings, current task, daily counts, and session history.
- Optional analytics later.

### P20 Habit Tracker

Target behavior:

- Server-backed habits and completion dates.
- Preserve weekly/monthly/heatmap views.

### P21 Dictionary

Target behavior:

- Server-backed favorites and lookup history.
- Keep bundled dictionary data client-side unless a larger dictionary source is selected.

### P22 Translator

Target behavior:

- Server-backed translation history.
- Optional real provider call from backend.

Provider prerequisite:

- Choose provider and secret handling. If no provider is chosen, implement history sync only.

### P23 Photo Album

Target behavior:

- Store uploaded photos as server files.
- Store albums and photo metadata server-side.
- Rehydrate photos after browser reload.

### P24 Camera

Target behavior:

- Save captured photos into the Photo Album media library.
- Keep camera device access in the browser.

### P25 Voice Recorder

Target behavior:

- Save recorded audio blobs to the server.
- Rehydrate recordings after reload.
- Store duration and timestamp metadata server-side.

### P26 Music Player

Target behavior:

- Browse and play a server-backed music library.
- Save playlists and playback preferences server-side.

### P27 Video Player

Target behavior:

- Browse and play server-side video files.
- Save playlists and playback preferences server-side.
- Streaming/range request support may be needed for large files.

### P28 PDF Reader

Target behavior:

- Open PDFs from File Manager and server library.
- Persist recent files and reading position server-side.

### P29 Paint

Target behavior:

- Save drawings as PNG files through `/api/fs` or the media library.
- Open existing images as canvas inputs.

### P30 Low-Priority Local Tools And Games

Apps:

- Calculator.
- Clock.
- Color Picker.
- Base64 Tool.
- QR Code Generator.
- Password Generator.
- Regex Tester.
- JSON Editor.
- Go, Chinese Chess, Mahjong, Gomoku, Sudoku, Snake, 2048, Jigsaw.
- White Noise.
- Metronome.

Default decision:

- Do not build dedicated backend APIs for these until there is a concrete need for cross-device sync, shared files, saved presets, leaderboards, or generated artifacts.

Potential future backend:

- Generic app state store for settings, histories, presets, high scores, and saved game state.

## Validation Plan

Each implementation phase should record:

- Backend tests: `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...`.
- Backend vet when touching Go shared code: `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...`.
- Frontend build: `cd web && npm run build`.
- Manual app check through local Vite/backend or production after PR merge.
- Audit log check when the feature writes files, kills processes, connects externally, or stores credentials.

## Deployment Rule

For production updates, follow the repository's Git-backed workflow:

1. Implement locally.
2. Commit on a feature branch.
3. Push branch and create PR.
4. Review and merge to protected `main`.
5. SSH with `ssh dochenmo`.
6. Pull `main` on `/root/alysechen/github/mochan-linux`.
7. Rebuild, install, restart, and health-check according to `agent/operations.md`.

## Execution Record

- 2026-05-05: Created this task document from a current code scan. No app backend code has been changed yet.
- 2026-05-05: Completed P0 by adding authenticated generic app state storage under `/api/app-state`. State is stored as `<DataDir>/apps/<app-id>/state.json`; app IDs are restricted to lowercase letters, numbers, `_`, and `-`; documents are capped at 2 MiB; writes use temp-file plus rename; write/update/delete operations emit appstate audit events without logging state payloads.
- 2026-05-05: Added frontend helper `web/src/lib/app-state.ts` with list/get/getOrDefault/put/patch/remove methods. No individual app has been migrated to it yet.
- 2026-05-05: Added audit labels for `appstate.put`, `appstate.patch`, and `appstate.delete`.
- 2026-05-05: Completed P1 by adding `server/internal/trash` and mounting it under authenticated `/api/trash`. Trash metadata is stored in `<DataDir>/trash/index.json`, payloads are stored under `<DataDir>/trash/items/<id>`, and IDs are generated as 32-character hex strings.
- 2026-05-05: Added real trash operations: `/api/trash/move`, `/api/trash/list`, `/api/trash/restore`, `/api/trash/delete`, and `/api/trash/empty`. Move uses `os.Rename` first and falls back to recursive copy plus source removal for cross-device regular files, directories, and symlinks. Restore returns conflict when the original path already exists, keeping the trash item intact.
- 2026-05-05: Updated File Manager deletion to move files into server-side Trash instead of immediately deleting through `/api/fs`. Updated Trash UI to list backend metadata, restore selected items, permanently delete selected items, and empty the backend trash.
- 2026-05-05: Added frontend helper `web/src/lib/trash.ts` and audit labels for `trash.move`, `trash.restore`, `trash.delete`, and `trash.empty`.
- 2026-05-05: Completed P2 for file-backed editors and viewers. Text Editor standalone open/save/save-as now prompts for a server absolute path and uses `/api/fs/read` and `/api/fs/write`; localStorage is only used for an untitled draft when no server path is bound.
- 2026-05-05: Updated Markdown Editor with the same server-path open/save/save-as behavior, while preserving File Manager-launched direct file loading and saving. Markdown HTML export now supports writing to a server path; local downloads remain explicit local-copy actions.
- 2026-05-05: Updated Image Viewer so standalone users can open a server image path, and current rotated/flipped images can be saved to a server path through `/api/fs/upload`. Added `fsClient.stat` and `fsClient.uploadFileToPath` helpers to support that flow.
- 2026-05-06: Completed P3 by adding `server/internal/downloads` and mounting authenticated `/api/downloads`. Download metadata is stored in `<DataDir>/downloads/index.json`, completed files are stored in `<DataDir>/downloads/files`, active downloads stream in background goroutines to `.part` files, and stale queued/downloading jobs are marked failed on restart.
- 2026-05-06: Added real download operations for create, list, get, cancel, retry, and metadata delete. Completed rows link to saved files through `/api/fs/download`; deleting a completed row leaves the saved file in place. Download create/cancel/retry/delete emit audit events without exposing credentials because URL credentials are rejected at validation.
- 2026-05-06: Replaced Download Manager simulated data and random progress with `web/src/lib/downloads.ts`, backend polling, real progress/speed/size/error display, cancel/retry/delete actions, and completed-file open links.
- 2026-05-06: Completed P4 by adding `server/internal/netguard` and refactoring Browser plus Download Manager to use the shared guarded HTTP client. The guard allows authenticated loopback/private-network access but blocks URL credentials, cloud metadata hostnames, link-local addresses, and known metadata IPs.
- 2026-05-06: Added `server/internal/apitester` and mounted authenticated `POST /api/api-tester/run`. The runner supports GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS, validates headers, caps request bodies at 1 MiB, caps response previews at 2 MiB, returns structured network errors, and writes `apitester.run` audit events without logging query strings, headers, or bodies.
- 2026-05-06: Replaced API Tester simulated responses with `web/src/lib/api-tester.ts`, real backend execution, error/truncation display, real response headers/body rendering, and server-backed request history via app-state ID `apitester`.
- 2026-05-06: Completed P5 by adding `server/internal/rss` and mounting authenticated `/api/rss`. RSS data is stored in `<DataDir>/rss/index.json`; feed refreshes run from the server with `netguard`; RSS 2.0 and Atom parsing normalize article IDs, links, summaries, content, authors, and publish times.
- 2026-05-06: Added RSS operations for feed list/add/delete, refresh one, refresh all, article list, read/unread, star/unstar, and mark-all-read. Article read/star state is preserved across refreshes, and each feed is capped at 200 cached articles.
- 2026-05-06: Replaced RSS Reader's static demo feeds/articles with `web/src/lib/rss.ts`, backend-backed feed and article loading, real refresh/add/delete actions, read/star persistence, server-side error display, and original-article links.

## Validation Results

- 2026-05-05: `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...` passed.
- 2026-05-05: `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...` passed.
- 2026-05-05: `cd web && npm run build` passed. Vite still reports the existing large chunk warning.
- 2026-05-05: P1 backend tests cover move/list/restore, restore collision handling, permanent delete, empty trash, invalid input, HTTP routes, and audit event emission.
- 2026-05-05: P2 frontend build passed with `cd web && npm run build`; the existing Vite large chunk warning remains.
- 2026-05-05: P2 cumulative backend validation passed with `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...` and `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...`.
- 2026-05-06: P3 backend tests cover completed downloads, unsafe URL rejection, HTTP failure handling, cancel behavior, completed-job persistence, handler routing, and audit event emission.
- 2026-05-06: `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...` passed after rerunning outside the sandbox because Go `httptest` must bind a loopback listener.
- 2026-05-06: `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...` passed.
- 2026-05-06: `cd web && npm run build` passed. Vite still reports the existing large chunk warning.
- 2026-05-06: P4 backend tests cover GET execution, POST body forwarding, unsafe URL/header rejection, response truncation, network-error results, handler routing, timeout normalization, persisted audit safety for query secrets, and header filtering.
- 2026-05-06: P4 cumulative backend validation passed with `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...` and `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...`.
- 2026-05-06: P4 frontend validation passed with `cd web && npm run build`; the existing Vite large chunk warning remains.
- 2026-05-06: P5 backend tests cover RSS add/refresh/persist, Atom parsing, unsafe URL rejection, article read/star mutations, handler routes, and RSS audit events.
- 2026-05-06: P5 cumulative backend validation passed with `cd server && GOCACHE=/private/tmp/mochan-go-cache go test ./...` and `cd server && GOCACHE=/private/tmp/mochan-go-cache go vet ./...`.
- 2026-05-06: P5 frontend validation passed with `cd web && npm run build`; the existing Vite large chunk warning remains.

## Next Implementation Plan: P6 Git Client

P6 should make Git Client operate on real repositories while avoiding accidental destructive repository operations and secret leakage.

Proposed implementation order:

1. Inspect `web/src/apps/GitClient.tsx` to map its current repository selector, status, branch, log, diff, stage, commit, pull, and push UI behavior.
2. Define a repository allowlist under server data/config before exposing Git operations. Do not let arbitrary browser input run Git commands against arbitrary paths.
3. Add `server/internal/gitclient` with safe command execution using explicit argument arrays and fixed working directories. Avoid shell execution.
4. Implement read-only endpoints first: configured repo list, status porcelain v2, current branch, branches, recent log, file diff, and remotes with URLs redacted.
5. Add guarded write operations after read-only behavior is validated: stage, unstage, commit, checkout/create branch, fetch, pull. Push should remain explicit and may be deferred if credential behavior is unclear.
6. Redact secrets from all command output and never show credential-helper output, `.env` contents, access tokens, or remote URLs containing credentials.
7. Update Git Client UI to show real repo state, command errors, and confirmation prompts for write operations.
8. Validate with temporary Git repositories in Go tests, including dirty files, staged files, branch creation, commit, redacted remotes, and command error paths.

## Blockers And Open Decisions

- Need product decision before implementing SSH Client, FTP Client, Email Client, and Chat App because these require explicit credential and trust-boundary choices.
- Need decide whether generic app state should be one shared API or app-specific APIs. Default recommendation is shared state API for low-risk local-only apps, app-specific APIs for network/protocol/media apps.
- Need decide where app-generated user files should live under `DataDir` versus the real Linux home directory.
