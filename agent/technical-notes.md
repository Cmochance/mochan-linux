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
- Audit events are `download.create`, `download.cancel`, `download.retry`, and `download.delete`.

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
