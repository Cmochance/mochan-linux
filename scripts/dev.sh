#!/usr/bin/env bash
# Run the Go backend locally with throwaway credentials for development.
# Frontend runs separately:  cd web && npm run dev
#
# Default password: 'devpassword'  (override with MOCHAN_DEV_PASSWORD)

set -euo pipefail

cd "$(dirname "$0")/.."

DEV_PW="${MOCHAN_DEV_PASSWORD:-devpassword}"

export MOCHAN_LISTEN="${MOCHAN_LISTEN:-127.0.0.1:38421}"
export MOCHAN_USERNAME="${MOCHAN_USERNAME:-admin}"
export MOCHAN_PASSWORD_HASH="${MOCHAN_PASSWORD_HASH:-$(printf '%s' "$DEV_PW" | (cd server && go run ./cmd/mochan hash-password))}"
export MOCHAN_JWT_SECRET="${MOCHAN_JWT_SECRET:-$(cd server && go run ./cmd/mochan gen-secret)}"
export MOCHAN_DATA_DIR="${MOCHAN_DATA_DIR:-$(pwd)/.dev-data}"
mkdir -p "$MOCHAN_DATA_DIR"

echo "dev login: $MOCHAN_USERNAME / $DEV_PW"
echo "listening on $MOCHAN_LISTEN"
cd server && exec go run ./cmd/mochan run
