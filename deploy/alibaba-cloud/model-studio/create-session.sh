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
require_env AGENT_ID
require_env ENVIRONMENT_ID

SESSION_TITLE="${1:-Signal Creative Autopilot Session}"

jq -n \
  --arg agent "${AGENT_ID}" \
  --arg environment_id "${ENVIRONMENT_ID}" \
  --arg title "${SESSION_TITLE}" \
  '{agent: $agent, environment_id: $environment_id, title: $title}' |
curl -sS -X POST "${AGENTSTUDIO_URL}/sessions" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H "Content-Type: application/json" \
  --data @- | jq
