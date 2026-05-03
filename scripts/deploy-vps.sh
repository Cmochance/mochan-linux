#!/usr/bin/env bash
# One-shot deploy of the prebuilt /tmp/mochan-deploy/mochan-bundle.tar.gz
# to the dochenmo VPS. You will be prompted twice for the SSH password.
#
# Run from inside Claude Code with:
#   ! bash scripts/deploy-vps.sh
# (the leading `!` runs in your interactive terminal so the password prompt works)

set -euo pipefail

HOST="${MOCHAN_HOST:-24.199.99.248}"
USER="${MOCHAN_SSH_USER:-root}"
BUNDLE="${MOCHAN_BUNDLE:-/tmp/mochan-deploy/mochan-bundle.tar.gz}"

if [[ ! -f "$BUNDLE" ]]; then
  echo "bundle not found: $BUNDLE" >&2
  exit 1
fi

echo "==> uploading $(basename "$BUNDLE") ($(du -h "$BUNDLE" | cut -f1)) to $USER@$HOST"
scp -o StrictHostKeyChecking=accept-new "$BUNDLE" "$USER@$HOST:/tmp/mochan-bundle.tar.gz"

echo "==> remote install"
ssh -o StrictHostKeyChecking=accept-new "$USER@$HOST" bash -s <<'REMOTE'
set -euo pipefail
rm -rf /tmp/mochan-bundle && mkdir /tmp/mochan-bundle
tar -xzf /tmp/mochan-bundle.tar.gz -C /tmp/mochan-bundle
bash /tmp/mochan-bundle/remote-install.sh
REMOTE

echo
echo "==> deployed. mochan is up on http://127.0.0.1:38421 of $HOST"
echo "Next: open Nginx Proxy Manager and add a Proxy Host"
echo "  domain        = linux.mochance.xyz"
echo "  forward to    = http://127.0.0.1:38421"
echo "  websockets    = ON"
echo "  request a Let's Encrypt cert + Force SSL"
