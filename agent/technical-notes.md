# Technical Notes

## Server-Side Browser Proxy

- The Browser app uses `/api/browser/proxy?url=...` for real HTTP/HTTPS URLs that are not built-in `ink://` or simulated `.ink` pages.
- The endpoint is mounted inside the authenticated `/api` group, so browser proxy access requires the normal JWT cookie.
- Requests are made from the mochan-linux host network. This intentionally allows authenticated users to reach server-local services such as `127.0.0.1:<port>` and private-network HTTP services visible from the VPS.
- The proxy does not forward browser cookies, authorization headers, request bodies, or custom user-supplied headers to target sites.
- HTML, `srcset`, meta refresh URLs, and CSS `url(...)` references are rewritten back through `/api/browser/proxy` so subresources continue to load from the server side.
- Proxied HTML runs in a frontend iframe with scripts disabled, and the backend sends a restrictive Content Security Policy for HTML responses.
- The backend blocks link-local addresses and common cloud metadata endpoints, including `169.254.169.254`, `100.100.100.200`, and `fd00:ec2::254`.

## Server-Side Network Guardrails

- Shared server-side HTTP clients should use `server/internal/netguard` instead of hand-rolling dialers.
- `netguard.ParseHTTPURL` allows only HTTP/HTTPS, rejects URL credentials, strips fragments, and blocks literal cloud metadata targets before requests are made.
- `netguard.NewHTTPClient` disables environment proxies, validates redirects, and uses guarded dialing to block link-local and known metadata addresses after DNS resolution.
- Loopback and private-network addresses are intentionally allowed because mochan-linux is an authenticated workstation and these apps are expected to reach services visible from the server host.

## Generic App State Backend

- The shared app-state backend is mounted at `/api/app-state` inside the authenticated `/api` group.
- Documents are stored under `<DataDir>/apps/<app-id>/state.json` with a JSON envelope: `app_id`, `updated_at`, and `data`.
- App IDs must match lowercase letters/numbers plus `_` or `-`; this prevents path traversal and keeps one directory per app.
- Documents are capped at 2 MiB and writes use a temporary file plus rename.
- `PUT` replaces the whole app data document; `PATCH` shallow-merges JSON object keys and treats `null` values as deletes; `DELETE` removes the state document.
- Audit events are `appstate.put`, `appstate.patch`, and `appstate.delete`; event details include only `app_id` and byte size, not user state payloads.
- Frontend code should use `web/src/lib/app-state.ts` rather than direct `fetch` calls for generic state migrations.

## Server-Side Trash

- The Trash backend is mounted at `/api/trash` inside the authenticated `/api` group.
- Metadata is stored in `<DataDir>/trash/index.json`; moved payloads live under `<DataDir>/trash/items/<id>`.
- File Manager deletion should call `trashClient.move(path)` from `web/src/lib/trash.ts`; `/api/fs` delete remains a permanent delete primitive and should not be the default File Manager delete path.
- Trash IDs are 32-character hex strings. Restore returns HTTP 409 when the original path already exists, and the trash item remains available.
- Move uses `os.Rename` first and falls back to recursive copy plus source removal for cross-device regular files, directories, and symlinks.
- Audit events are `trash.move`, `trash.restore`, `trash.delete`, and `trash.empty`.

## File-Backed Editors And Viewers

- Text Editor and Markdown Editor preserve File Manager launch payloads through `usePayloadPath(windowId)` and read/write the supplied path with `/api/fs`.
- Standalone Text Editor and Markdown Editor now prompt for server absolute paths for open, save, and save-as. Browser `localStorage` is only a draft fallback while no server path is bound.
- Markdown Editor HTML export can write an HTML file to a server path; local downloads are explicit local-copy actions.
- Image Viewer can open a server image path directly, keeps browser-uploaded images visible locally, and can save the current rotated/flipped canvas to a server path.
- `fsClient.stat(path)` wraps `/api/fs/stat`; `fsClient.uploadFileToPath(path, blob, type)` wraps `/api/fs/upload` for generated browser blobs such as edited images.

## Server-Side Downloads

- The Download Manager backend is mounted at `/api/downloads` inside the authenticated `/api` group.
- Download metadata is stored in `<DataDir>/downloads/index.json`; completed files live under `<DataDir>/downloads/files`.
- Jobs are created with `POST /api/downloads/`, listed with `GET /api/downloads/`, inspected with `GET /api/downloads/{id}`, canceled with `POST /api/downloads/{id}/cancel`, retried with `POST /api/downloads/{id}/retry`, and removed from metadata with `DELETE /api/downloads/{id}`.
- Downloads run in background goroutines, stream into `.part` files, and rename into the final output path only after successful completion. Restarted queued or active jobs are marked failed so stale in-progress metadata is not misleading.
- Completed output files are opened through `/api/fs/download?path=...`; deleting a completed download row removes only download metadata, not the saved file.
- The downloader uses the same guardrail direction as the Browser proxy: HTTP/HTTPS only, no URL credentials, cloud metadata hostnames blocked, and link-local or known metadata addresses blocked before dialing.
- When a job is created without an explicit `file_name`, the downloader may replace the URL-derived filename with a safe `Content-Disposition` attachment filename after receiving response headers.
- Audit events are `download.create`, `download.cancel`, `download.retry`, and `download.delete`.

## Browser Download Integration

- Browser current-page downloads and file-like proxied iframe links enqueue jobs through `/api/downloads/`; the Browser proxy remains a preview path with its existing memory cap and script-disabled sandbox.
- File-like iframe link interception currently covers HTTP/HTTPS anchors with a `download` attribute or a known archive, installer, document, media, image, or binary extension.
- Browser-started downloads do not forward remote cookies, JavaScript blob contents, POST form bodies, or authenticated third-party browser sessions. Those would need a separate session-aware download design.

## Server-Side API Tester

- API Tester executes requests through `POST /api/api-tester/run`, mounted inside the authenticated `/api` group.
- The runner accepts method, URL, enabled headers, body, and timeout. It supports GET, POST, PUT, DELETE, PATCH, HEAD, and OPTIONS.
- Request bodies are capped at 1 MiB, response previews are capped at 2 MiB, and large responses include a truncation marker.
- The backend rejects URL credentials, cloud metadata targets, `Host`, `Content-Length`, hop-by-hop headers, invalid header names, and CR/LF header values.
- Network failures are returned as structured API Tester results so the UI can show them without treating the app itself as broken.
- Request history is persisted through the generic app-state backend under app ID `apitester`.
- Audit event `apitester.run` records method, scheme, host, path, status, elapsed time, and outcome. It intentionally omits query strings, request headers, and request bodies to avoid logging secrets.

## Server-Side RSS Reader

- RSS Reader is backed by `/api/rss`, mounted inside the authenticated `/api` group.
- Feed and article cache data is stored in `<DataDir>/rss/index.json` with temp-file plus rename writes.
- Supported operations: list/add/delete feeds, refresh one feed, refresh all feeds, list articles, mark one article read/unread, star/unstar one article, and mark the current article set read.
- Feed fetching uses `netguard.NewHTTPClient`, so RSS and Atom refreshes share the same server-side network restrictions as Browser, Download Manager, and API Tester.
- The parser supports RSS 2.0 and Atom feeds using Go XML parsing. Article IDs are stable hashes built from feed ID plus GUID, Atom ID, link, title, and publish time fallbacks.
- Article read/star state is preserved across refreshes, and each feed is capped at 200 cached articles to prevent unbounded growth.
- Audit events are `rss.feed.add`, `rss.feed.delete`, `rss.feed.refresh`, `rss.refresh`, `rss.article.read`, `rss.article.star`, and `rss.article.read_all`. Feed URL query strings, article bodies, and request headers are not logged.

## Server-Side Git Client

- Git Client is backed by `/api/git`, mounted inside the authenticated `/api` group.
- Repository records are stored under `<DataDir>/git/index.json`. A repository must be explicitly registered with an absolute path and validated through `git rev-parse --show-toplevel` before any operation is allowed.
- Git commands run through `exec.CommandContext` with explicit argument arrays, `GIT_TERMINAL_PROMPT=0`, empty askpass variables, and a 45-second timeout.
- Supported operations include repo list/add/remove, status, diff, log, branches, stage, unstage, commit, switch, create branch, fetch, pull, and merge.
- Command output is capped and redacts remote URL credentials plus common token-like query values before returning to the UI or audit detail.
- Audit events include `git.repo.add`, `git.repo.delete`, `git.stage`, `git.unstage`, `git.commit`, `git.checkout`, `git.branch.create`, `git.fetch`, `git.pull`, and `git.merge`.

## Server-Side SSH Client

- SSH Client is backed by `/ws/ssh`, authenticated with the existing JWT cookie or token query parameter.
- The browser sends credentials only in the first WebSocket connect message. The backend does not persist SSH credentials or host keys in this phase.
- Host key policy is visible in the UI as `session-only`; the backend currently uses a non-persistent host-key callback to avoid writing host state before a durable trust-store design exists.
- The backend requests a PTY, starts a real remote shell, and bridges stdout, stderr, and stdin over WebSocket. WebSocket writes are serialized so stdout and stderr do not race on the same connection.
- Audit event `ssh.connect` records host, port, username, policy, outcome, and error text, but not passwords.

## Server-Side File Transfer

- FTP Client is backed by `/api/file-transfer`, mounted inside the authenticated `/api` group.
- Plain FTP is disabled. The implemented protocol is SFTP-style file transfer over SSH transport, using session-only password credentials sent with each request from browser state.
- Supported operations include connect test, remote list, remote mkdir, remote delete, upload from a server-local path to a remote path, and download from a remote path to a server-local path.
- Local files are real server filesystem paths and should be selected from the File Manager-compatible `/api/fs` listing in the UI.
- Audit events include `filetransfer.connect`, `filetransfer.mkdir`, `filetransfer.delete`, `filetransfer.upload`, and `filetransfer.download`; passwords are never logged.

## Server-Side Bookmarks

- Bookmarks are backed by `/api/bookmarks`, mounted inside the authenticated `/api` group.
- Bookmark data is stored under `<DataDir>/bookmarks/index.json` with folders and bookmarks in one JSON document.
- Browser star/bookmark toggles and the Bookmarks app share the same backend store. Browser bookmark clicks increment visit counts through `/api/bookmarks/bookmarks/{id}/visit`.
- Import writes through `/api/bookmarks/import`; export remains a browser-side JSON download from the current backend state.
- Audit events include `bookmarks.bookmark.add`, `bookmarks.bookmark.update`, `bookmarks.bookmark.delete`, `bookmarks.folder.add`, `bookmarks.folder.delete`, and `bookmarks.import`.

## Server-Side Weather

- Weather is backed by `/api/weather`, mounted inside the authenticated `/api` group.
- `/api/weather/search` uses Open-Meteo geocoding, and `/api/weather/forecast` uses Open-Meteo forecast data. No provider key is required.
- Forecasts are cached under `<DataDir>/weather/cache.json` by coordinate for 15 minutes.
- Weather HTTP calls use `netguard.NewHTTPClient`, so they share the same server-side network restrictions as Browser, Download Manager, API Tester, and RSS Reader.
- Audit events are `weather.search` and `weather.forecast`; audit detail avoids provider response bodies.

## Server-Side Mail Client

- Email Client is backed by `/api/mail`, mounted inside the authenticated `/api` group.
- Mail credentials are session-only. The frontend sends IMAP/SMTP credentials with each request; the backend does not persist accounts, passwords, message bodies, or attachments in app-state.
- Supported IMAP operations are connect validation, folder list, message summary list, and message body fetch. The implementation uses a small IMAP command subset with guarded TCP dialing and supports `tls`, `starttls`, and `plain` security modes.
- Supported SMTP operations are connect validation and sending plain text mail. Optional attachments are read from absolute server filesystem paths and are capped before MIME encoding.
- Mail TCP dialing uses `netguard.GuardedDialContext`, so link-local and known metadata addresses are blocked while normal public, loopback, and private-network mail hosts remain reachable for the authenticated workstation user.
- Audit events are `mail.connect`, `mail.imap.list`, `mail.imap.messages`, `mail.imap.message`, and `mail.smtp.send`; audit details include protocol, host, port, folder, recipient count, attachment count, and outcome, but not credentials, message content, headers, or attachment content.

## App-State Migrations

- Chat App now uses app-state ID `chatapp` for the selected Option A scope: a single-user message notebook. The old random automatic replies were removed so the app no longer invents new messages.
- Notes now uses app-state ID `notes`. Existing `localStorage` sticky notes are read only as the first fallback when no server document exists; subsequent writes go to the server state document.
- Calendar now uses app-state ID `calendar`. Events are persisted server-side, and `.ics` import/export works against the same normalized event list.
- Notebook now uses app-state ID `notebook` for notebooks, rich note HTML, tags, starred state, and archive state. Existing localStorage notebook data is a one-time fallback when no server document exists.
- Spreadsheet now uses app-state ID `spreadsheet` for workbook cells, column widths, and row heights. Formula evaluation remains frontend-only.
- Mind Map now uses app-state ID `mindmap` for the node graph. JSON import/export exchanges the same server-backed document shape; PNG export remains a local copy action.
- Presentation now uses app-state ID `presentation` for slide decks. JSON import/export exchanges the same server-backed document shape; PPTX export remains deferred.
- Pomodoro now uses app-state ID `pomodoro` for settings, current task, daily completed count, and session history. The active countdown itself is not restored after reload.
- Habit Tracker now uses app-state ID `habittracker` for habits and completion dates.
- Dictionary now uses app-state ID `dictionary` for favorites, lookup history, and word-of-day selection. The dictionary source remains the bundled frontend dataset.
- Translator now uses app-state ID `translator` for translation history. Real provider-backed translation remains deferred until a provider and secret policy are chosen.
- Photo Album now uses app-state ID `photoalbum` for custom albums and photo metadata. Photo files are stored in the server user's real home at `~/.mochan/media/photos` through `/api/fs/upload` and displayed through `/api/fs/download`.
- Camera saves captured PNG files into the Photo Album media library with photo source `camera`; webcam access stays browser-side.
- Voice Recorder now uses app-state ID `voicerecorder` for recording metadata. Audio blobs are stored in `~/.mochan/media/audio` through `/api/fs/upload` and displayed through `/api/fs/download`.
- Music Player now uses app-state ID `musicplayer` for playlist order and playback preferences. Audio files live in `~/.mochan/media/music` and are played through `/api/fs/download`.
- Video Player now uses app-state ID `videoplayer` for playlist order and playback preferences. Video files live in `~/.mochan/media/videos` and are played through `/api/fs/download`.
- PDF Reader now uses app-state ID `pdfreader` for recent files and reading position. File Manager routes `.pdf` files into the app, and uploaded PDFs live in `~/.mochan/media/documents`.
- Paint now uses app-state ID `paint` for tool settings and recent drawing metadata. Canvas PNG saves live in `~/.mochan/media/drawings`, and existing local or server images can be opened into the canvas.
- Low-priority persistent local data now uses app-state where useful: Calculator history (`calculator`), Snake high score (`snake`), 2048 best score (`puzzle2048`), and Radio favorites/preferences (`radio`).

## Media Library Helpers

- `web/src/lib/media-library.ts` centralizes media paths, `/api/fs/upload` writes, `/api/fs/download` URLs, and Photo Album metadata helpers for apps that generate user media.
- Current media paths are under the real Linux home directory as `~/.mochan/media/<kind>`, not under backend `DataDir`. This keeps generated media visible to File Manager and avoids putting large blobs into the 2 MiB app-state document cap.
- Shared media kinds currently include `photos`, `audio`, `music`, `videos`, `documents`, and `drawings`.
- `apiFetch` must not force `content-type: application/json` for `FormData`; file upload clients rely on the browser-generated multipart boundary.
