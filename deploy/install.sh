#!/usr/bin/env bash
# mochan-linux server installer (Ubuntu/Debian).
# Idempotent: safe to re-run.
#
# Usage (on target server, as root):
#   curl -fsSL https://raw.githubusercontent.com/<you>/mochan-linux/main/deploy/install.sh \
#     | bash -s -- --binary /path/to/mochan
#
# Or after building locally:
#   scp ./bin/mochan root@HOST:/tmp/mochan
#   ssh root@HOST 'bash -s' < deploy/install.sh -- --binary /tmp/mochan

set -euo pipefail

BINARY=""
RUN_USER="mochan"
LISTEN="${MOCHAN_LISTEN:-127.0.0.1:38421}"
USERNAME="${MOCHAN_USERNAME:-admin}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --binary) BINARY="$2"; shift 2 ;;
    --user) RUN_USER="$2"; shift 2 ;;
    --listen) LISTEN="$2"; shift 2 ;;
    --username) USERNAME="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "must run as root" >&2
  exit 1
fi

if [[ -z "$BINARY" || ! -x "$BINARY" ]]; then
  echo "--binary <path-to-mochan> is required and must be executable" >&2
  exit 2
fi

echo "==> creating system user '$RUN_USER'"
if ! id "$RUN_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$RUN_USER"
fi

echo "==> granting NOPASSWD sudo to '$RUN_USER'"
echo "$RUN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/mochan-${RUN_USER}"
chmod 0440 "/etc/sudoers.d/mochan-${RUN_USER}"

echo "==> installing binary to /usr/local/bin/mochan"
install -m 0755 "$BINARY" /usr/local/bin/mochan

echo "==> preparing /etc/mochan and /var/lib/mochan"
mkdir -p /etc/mochan /var/lib/mochan
chown "$RUN_USER:$RUN_USER" /var/lib/mochan
chmod 0750 /etc/mochan

if [[ ! -f /etc/mochan/config.env ]]; then
  echo "==> generating /etc/mochan/config.env (interactive)"
  read -rsp "set password for user '$USERNAME': " PW1; echo
  read -rsp "confirm password: " PW2; echo
  if [[ "$PW1" != "$PW2" || ${#PW1} -lt 8 ]]; then
    echo "passwords do not match or are too short (min 8)" >&2
    exit 1
  fi
  HASH=$(printf '%s' "$PW1" | /usr/local/bin/mochan hash-password)
  SECRET=$(/usr/local/bin/mochan gen-secret)
  umask 077
  cat > /etc/mochan/config.env <<EOF
MOCHAN_LISTEN=$LISTEN
MOCHAN_USERNAME=$USERNAME
MOCHAN_PASSWORD_HASH=$HASH
MOCHAN_JWT_SECRET=$SECRET
MOCHAN_TOKEN_TTL=24h
MOCHAN_DATA_DIR=/var/lib/mochan
MOCHAN_SHELL_USER=$RUN_USER
EOF
  chown root:"$RUN_USER" /etc/mochan/config.env
  chmod 0640 /etc/mochan/config.env
else
  echo "==> /etc/mochan/config.env already present, leaving untouched"
fi

echo "==> installing systemd unit"
install -m 0644 "$(dirname "$0")/mochan.service" /etc/systemd/system/mochan.service 2>/dev/null \
  || cat > /etc/systemd/system/mochan.service <<'UNIT'
[Unit]
Description=mochan-linux web workstation
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mochan
Group=mochan
EnvironmentFile=/etc/mochan/config.env
ExecStart=/usr/local/bin/mochan run
Restart=on-failure
RestartSec=3
WorkingDirectory=/var/lib/mochan
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now mochan.service
sleep 1
systemctl --no-pager --full status mochan.service || true

echo
echo "==> mochan is up on $LISTEN"
echo "Next: in Nginx Proxy Manager, add a Proxy Host pointing your domain to"
echo "  http://127.0.0.1:${LISTEN##*:}"
echo "with WebSockets Support enabled and TLS via Let's Encrypt."
