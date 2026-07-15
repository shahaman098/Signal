#!/usr/bin/env bash

set -euo pipefail

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

require_env() {
  [[ -n "${!1:-}" ]] || {
    printf 'Missing required environment variable: %s\n' "$1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd jq

require_env DASHSCOPE_API_KEY
require_env AGENTSTUDIO_URL
require_env SESSION_ID

PROMPT="${1:-Decide the next highest-leverage creative action for this brand based on the latest fatigue and competitor signals.}"

jq -n \
  --arg prompt "${PROMPT}" \
  '{input: [{role: "user", type: "message", content: [{type: "text", text: $prompt}]}]}' |
curl -sS -X POST "${AGENTSTUDIO_URL}/sessions/${SESSION_ID}/events" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H "Content-Type: application/json" \
  --data @- | jq
