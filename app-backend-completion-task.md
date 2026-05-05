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
- Git Client: `/api/git` stores explicitly registered repository roots, reports real status/log/branches/diffs, and performs stage, unstage, commit, switch, branch, fetch, pull, and merge through server-side `git`.
- SSH Client: `/ws/ssh` opens real session-only SSH shells through the backend WebSocket bridge; credentials are not persisted.
- FTP Client: `/api/file-transfer` provides SFTP-over-SSH style listing, mkdir, delete, upload, and download between the server filesystem and a remote host; credentials are held only in browser state for the current session.
- Bookmarks: `/api/bookmarks` persists folders and bookmarks server-side; Browser star/bookmark actions and the Bookmarks app share the same store.
- Weather: `/api/weather` searches locations and fetches cached Open-Meteo forecasts from the backend.
- Email Client: `/api/mail` performs real session-only IMAP folder/message reads and SMTP sends. Mail credentials are supplied per request and are not persisted.
- Chat App: `/api/app-state` app ID `chatapp` persists the selected Option A single-user message notebook.
- Notes: `/api/app-state` app ID `notes` persists sticky notes server-side after one-time localStorage migration fallback.
- Calendar: `/api/app-state` app ID `calendar` persists events server-side; `.ics` import/export reads and writes the same event state.
- Notebook: `/api/app-state` app ID `notebook` persists notebooks, rich notes, tags, starred state, and archive state after one-time localStorage migration fallback.

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
- [x] P6 Git Client: real repository status, diff, branch, and commit operations.
- [x] P7 SSH Client: real SSH sessions through the server.
- [x] P8 FTP Client: real SFTP/FTP file transfer.
- [x] P9 Bookmarks: persistent bookmark store integrated with Browser.
- [x] P10 Weather: real weather provider and server cache.
- [x] P11 Email Client: real IMAP/SMTP account support.
- [x] P12 Chat App: define and implement real messaging scope.
- [x] P13 Notes: server-backed notes.
- [x] P14 Calendar: server-backed events.
- [x] P15 Notebook: server-backed notebooks and rich notes.
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

Implementation note:

- P6 uses `/api/git`; repository roots must be explicitly registered and validated as real Git worktrees before operations are allowed.
- Backend commands run with `GIT_TERMINAL_PROMPT=0`, redacted output, timeouts, and no credential-helper prompting. Remote URL credentials and common token-like query values are redacted before responses or audit details.
- UI supports register repo, status, staged/unstaged diff, stage/unstage, commit, branch switch/create, fetch, pull, and merge.

### P7 SSH Client

Target behavior:

- Real SSH sessions proxied through the backend, likely WebSocket-based.
- Credentials are not stored by default.
- Host key policy is explicit and visible.
- Session transcript and connection attempts are audit logged.

Security prerequisite:

- Decide whether this app is allowed at all on a public single-user workstation, because it expands the service into a general SSH jump box.

Implementation note:

- P7 is enabled as a real session-only SSH terminal through `/ws/ssh`.
- Password credentials are sent only as the initial WebSocket connect message and are not written to app-state or server-side files.
- Host key handling is explicit in the UI as `session-only`; this keeps behavior visible while avoiding persistent host-key or credential stores in this phase.

### P8 FTP Client

Target behavior:

- Prefer SFTP first; plain FTP can be optional or disabled by default.
- Real remote listing, upload, download, rename, delete, and transfer progress.
- Use the same credential policy as SSH Client.

Implementation note:

- P8 implements SFTP-style operations over SSH transport through `/api/file-transfer`; plain FTP remains disabled.
- The app lists real remote directories, creates remote folders, deletes remote files/directories, uploads server-side local files to the remote host, and downloads remote files into the server filesystem.
- Credentials follow the SSH phase boundary: session-only browser state, not backend persistence.

### P9 Bookmarks

Target behavior:

- Persist bookmarks and folders server-side.
- Connect Browser star/bookmark actions to the same store.
- Import/export JSON through the backend.

Implementation note:

- P9 uses `/api/bookmarks` with a JSON store under the server data directory.
- Browser bookmark toggles and the Bookmarks app read and write the same backend store.
- Import/export remains user-driven in the browser, but import writes through the backend instead of merging only in component state.

### P10 Weather

Target behavior:

- Query a real provider from the backend.
- Cache by location and time window.
- Keep provider keys, if any, on the server only.

Low-risk provider option:

- Open-Meteo can provide weather without a frontend secret.

Implementation note:

- P10 uses `/api/weather/search` and `/api/weather/forecast` backed by Open-Meteo geocoding and forecast APIs.
- Provider calls run from the backend with the shared network guardrail client and cache forecasts for 15 minutes by coordinate.
- No provider key is required or exposed to the frontend.

### P11 Email Client

Target behavior:

- Real IMAP inbox/folders and SMTP send.
- Server-side account configuration and optional encrypted credential storage.
- Attachments flow through the server file system.

Security prerequisite:

- Decide whether credentials are session-only or stored on disk. Do not implement stored mail credentials without an explicit encryption and rotation plan.

Implementation note:

- P11 uses `/api/mail` with session-only IMAP/SMTP credentials. The backend supports connect validation, folder listing, message summaries, message body fetch, attachment metadata, and SMTP send with optional server-file attachments. Credentials, message bodies, request headers, and attachment content are not written to app-state or audit detail.

### P12 Chat App

Scope decision required before implementation:

- Option A: local single-user message notebook with persistence.
- Option B: multi-user self-hosted chat inside this mochan-linux instance.
- Option C: connector to an external service.

Default recommendation:

- Implement only Option A or defer until the product direction is clear.

Implementation note:

- P12 chose Option A: a local single-user message notebook with server persistence. The app no longer generates fake automatic replies; user-authored messages and thread state are stored through `/api/app-state` under app ID `chatapp`.

### P13 Notes

Target behavior:

- Replace `localStorage` with server-backed CRUD.
- Keep pinned/color/search behavior.
- Optional export to plain files under a notes directory.

Implementation note:

- P13 stores sticky notes through `/api/app-state` under app ID `notes`. Existing browser-local notes are used only as the first fallback when no server state exists.

### P14 Calendar

Target behavior:

- Server-backed events.
- Import/export `.ics`.
- Optional reminder scheduling later.

Implementation note:

- P14 stores calendar events through `/api/app-state` under app ID `calendar`. Import and export use `.ics` files in the browser, then persist the normalized event list server-side.

### P15 Notebook

Target behavior:

- Server-backed notebooks, notes, tags, archived state, and rich text content.
- Migration path from `localStorage`.

Implementation note:

- P15 stores notebooks and rich notes through `/api/app-state` under app ID `notebook`. Existing localStorage notebooks and notes are used as a migration fallback when no server document exists.

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
- 2026-05-06: Completed P6 by adding `server/internal/gitclient` and mounting authenticated `/api/git`. Repositories must be explicitly registered and validated as real Git worktrees before operations are allowed. The Git Client now shows real status, diffs, logs, branches, stage/unstage, commit, fetch, pull, branch create/switch, and merge actions.
- 2026-05-06: Completed P7 by adding `server/internal/sshclient` and mounting `/ws/ssh`. SSH sessions are proxied through a backend WebSocket, use session-only password credentials, and show the session-only host-key policy in the UI.
- 2026-05-06: Completed P8 by adding `server/internal/filetransfer` and mounting authenticated `/api/file-transfer`. The FTP Client now uses SFTP-over-SSH style backend operations for remote list, mkdir, delete, upload, and download; plain FTP remains disabled.
- 2026-05-06: Completed P9 by adding `server/internal/bookmarks` and mounting authenticated `/api/bookmarks`. The Bookmarks app and Browser star/bookmark UI now share one server-side bookmark/folder store.
- 2026-05-06: Completed P10 by adding `server/internal/weather` and mounting authenticated `/api/weather`. Weather search and forecasts now come from backend Open-Meteo calls with a 15-minute coordinate cache and no frontend provider key.
- 2026-05-06: Completed P11 by adding `server/internal/mailclient` and mounting authenticated `/api/mail`. Email Client now connects to real IMAP accounts for folders, message summaries, and message bodies, and sends mail through SMTP. Mail credentials remain session-only and are not written to server state.
- 2026-05-06: Completed P12 by selecting the documented default Option A for Chat App. Chat threads and messages are now persisted through app-state under `chatapp`, and the previous random fake reply behavior was removed.
- 2026-05-06: Completed P13 by migrating Notes from browser-local save behavior to app-state under `notes`, preserving pinned, color, search, edit, and delete behavior with one-time localStorage fallback.
- 2026-05-06: Completed P14 by migrating Calendar events to app-state under `calendar` and adding `.ics` import/export over the same server-backed event list.
- 2026-05-06: Completed P15 by migrating Notebook notebooks, rich notes, tags, starred state, and archived state to app-state under `notebook`, with localStorage used only as a migration fallback.

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
- 2026-05-06: P6-P10 targeted backend tests passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go test ./internal/gitclient ./internal/bookmarks ./internal/weather ./internal/filetransfer ./internal/sshclient ./cmd/mochan`.
- 2026-05-06: P6-P10 cumulative backend validation passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go test ./...` after rerunning outside the sandbox because existing `httptest` suites must bind loopback listeners.
- 2026-05-06: P6-P10 cumulative backend vet passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go vet ./...`.
- 2026-05-06: P6-P10 frontend and embedded binary validation passed with `GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache make build VERSION="1.0.0+p6-p10"`; the existing Vite large chunk warning remains.
- 2026-05-06: P11 targeted backend validation passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go test ./internal/mailclient ./cmd/mochan`.
- 2026-05-06: P11-P15 frontend validation passed with `cd web && npm run build`; the existing Vite large chunk warning remains.
- 2026-05-06: P11-P15 cumulative backend vet passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go vet ./...`.
- 2026-05-06: P11-P15 cumulative backend validation passed with `cd server && GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache go test ./...` after rerunning outside the sandbox because existing `httptest` suites must bind loopback listeners.
- 2026-05-06: P11-P15 frontend embedding and binary validation passed with `GOCACHE=/Users/alysechen/alysechen/github/mochan-linux/.tmp/go-cache make build VERSION="1.0.0+p11-p15"`; the existing Vite large chunk warning remains.

## Next Implementation Plan: P16 Spreadsheet

P16 should make Spreadsheet documents server-backed while keeping the existing client-side calculation behavior for this first pass.

Proposed implementation order:

1. Inspect `web/src/apps/Spreadsheet.tsx` to identify workbook shape, current local state, import/export behavior, and formula recalculation boundaries.
2. Store workbook documents through `/api/app-state` if the app has a single current workbook, or use `/api/fs`/an app-specific document path if multiple named workbook files are already part of the UI.
3. Preserve formula calculation in the frontend; do not introduce a backend calculation engine in this phase.
4. Keep import/export behavior compatible with the current JSON or CSV surface, then persist imported workbook state server-side.
5. Validate with `npm run build`; run backend tests only if a new server endpoint is added.

## Blockers And Open Decisions

- Need decide whether generic app state should be one shared API or app-specific APIs. Default recommendation is shared state API for low-risk local-only apps, app-specific APIs for network/protocol/media apps.
- Need decide where app-generated user files should live under `DataDir` versus the real Linux home directory.
