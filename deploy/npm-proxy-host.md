# Nginx Proxy Manager — proxy host setup

> **If your reverse proxy runs in Docker (NPM, Traefik, Caddy in a container)**,
> the `127.0.0.1` of the proxy is the *container itself*. The Go server must be
> reachable from inside the container.
>
> Two options, in order of simplicity:
>
> 1. Bind the Go server to the Docker bridge IP and forward there.
>    Set `MOCHAN_LISTEN=172.17.0.1:38421` in `/etc/mochan/config.env` and add
>    `After=docker.service` to the systemd unit. Forward in the proxy to
>    `http://172.17.0.1:38421`. The bridge IP is private, no firewall needed.
> 2. Bind to `0.0.0.0:38421`, then add an iptables/ufw rule that drops
>    external traffic on `38421` and only allows the docker bridge and
>    loopback.
>
> If the proxy and the Go server are on the same machine **and the proxy is
> native (not in Docker)**, `127.0.0.1:38421` works fine.

## Details tab

- **Domain Names**: `linux.mochance.xyz`
- **Scheme**: `http`
- **Forward Hostname / IP**: `172.17.0.1` (Docker bridge — see note above)
- **Forward Port**: `38421` (must match `MOCHAN_LISTEN`)
- **Cache Assets**: off
- **Block Common Exploits**: on
- **Websockets Support**: **on** (required — Phase 1+ uses `wss://`)
- **Access List**: optional (recommended for an extra IP allowlist)

## SSL tab

- **SSL Certificate**: `Request a new SSL Certificate (Let's Encrypt)`
- **Force SSL**: on
- **HTTP/2 Support**: on
- **HSTS Enabled**: on
- **Use a DNS Challenge**: only if NPM cannot reach this host on port 80

## Custom Nginx Configuration (Advanced tab)

Optional. **Paste only complete directives — never abbreviated patterns.**
NPM does no validation of this field; a malformed line silently corrupts the
generated config and breaks SSL provisioning.

Safe to paste verbatim:

```nginx
client_max_body_size 256m;
proxy_read_timeout   86400s;
proxy_send_timeout   86400s;
```

## Cloudflare interaction

`mochance.xyz` sits behind Cloudflare (orange cloud / proxied). Two gotchas:

1. Cloudflare's SSL/TLS mode must be **Full** or **Full (strict)** so the
   browser ↔ Cloudflare ↔ origin chain stays HTTPS end-to-end. "Flexible"
   downgrades CF→origin to HTTP and breaks WebSockets in subtle ways.
2. The Let's Encrypt HTTP-01 challenge passes through CF on port 80 — make
   sure no "Always Use HTTPS" page rule rewrites the `/.well-known/`
   path to HTTPS during issuance. NPM provisioning succeeds without page
   rules in the way.

## Verification

```bash
curl -I https://linux.mochance.xyz/healthz   # expect 200
```
