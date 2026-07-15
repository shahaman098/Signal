#!/usr/bin/env bash

set -euo pipefail

require_env() {
  [[ -n "${!1:-}" ]] || {
    printf 'Missing required environment variable: %s\n' "$1" >&2
    exit 1
  }
}

require_env DASHSCOPE_API_KEY
require_env AGENTSTUDIO_URL
require_env SESSION_ID

curl -N "${AGENTSTUDIO_URL}/sessions/${SESSION_ID}/events/stream" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H "Accept: text/event-stream"
