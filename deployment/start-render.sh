#!/bin/sh
set -eu

: "${PORT:=10000}"
: "${RENDER_EXTERNAL_URL:?Render must provide RENDER_EXTERNAL_URL}"
: "${LANCE_PASSWORD_HASH:?Set LANCE_PASSWORD_HASH in Render secrets}"

export PORT
export LANCE_PUBLIC_ORIGIN="${LANCE_PUBLIC_ORIGIN:-$RENDER_EXTERNAL_URL}"

# A persistent disk can be mounted as root. Prepare only the dedicated app
# paths here, then drop privileges for both network-facing processes.
mkdir -p /data/media /tmp/caddy-config /tmp/caddy-data
chown -R studio:studio /data /tmp/caddy-config /tmp/caddy-data

setpriv --reuid=studio --regid=studio --init-groups \
  python3 -u /app/studio_server.py &
studio_pid=$!

stop_studio() {
  kill "$studio_pid" 2>/dev/null || true
  wait "$studio_pid" 2>/dev/null || true
}
trap stop_studio EXIT INT TERM

exec setpriv --reuid=studio --regid=studio --init-groups \
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
