# Server-Side Browser Proxy Implementation Plan

**Goal:** Build a server-side browser/proxy path so the Browser app fetches pages from the VPS host network instead of the user's local browser network.

**Architecture:** Add an authenticated Go handler under `/api/browser/proxy` that accepts an HTTP or HTTPS URL, validates it, fetches it with a hardened transport, rewrites HTML links and subresources back through the proxy, and streams the response. Update the React Browser app to render real URLs in a sandboxed iframe that points at this route while keeping existing `ink://` simulated pages.

**Tech Stack:** Go `net/http`, React, Vite, existing JWT middleware, existing same-origin API pattern.

---

## Tasks

1. Add `server/internal/browser` with URL validation, guarded HTTP client, response limits, and HTML rewriting.
2. Mount `/api/browser/proxy` inside the authenticated `/api` group.
3. Update `web/src/apps/Browser.tsx` so non-`ink://` and non-demo `.ink` URLs render through the proxy iframe.
4. Make the Vite development proxy target configurable so local verification can use a non-default backend port.
5. Add focused Go tests for URL validation, metadata blocking, and HTML rewrite behavior.
6. Run `go test ./...`, `npm run build`, and update durable project notes.
