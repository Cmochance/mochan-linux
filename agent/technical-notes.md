# Technical Notes

## Server-Side Browser Proxy

- The Browser app uses `/api/browser/proxy?url=...` for real HTTP/HTTPS URLs that are not built-in `ink://` or simulated `.ink` pages.
- The endpoint is mounted inside the authenticated `/api` group, so browser proxy access requires the normal JWT cookie.
- Requests are made from the mochan-linux host network. This intentionally allows authenticated users to reach server-local services such as `127.0.0.1:<port>` and private-network HTTP services visible from the VPS.
- The proxy does not forward browser cookies, authorization headers, request bodies, or custom user-supplied headers to target sites.
- HTML, `srcset`, meta refresh URLs, and CSS `url(...)` references are rewritten back through `/api/browser/proxy` so subresources continue to load from the server side.
- Proxied HTML runs in a frontend iframe with scripts disabled, and the backend sends a restrictive Content Security Policy for HTML responses.
- The backend blocks link-local addresses and common cloud metadata endpoints, including `169.254.169.254`, `100.100.100.200`, and `fd00:ec2::254`.
