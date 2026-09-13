#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "未找到 .env。请先执行: cp .env.example .env，然后填写火山引擎凭据。"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

exec python3 "$SCRIPT_DIR/jimeng_proxy.py"
