#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENT_SPEC="${ROOT_DIR}/deploy/alibaba-cloud/model-studio/signal-managed-agent.json"

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

curl -sS -X POST "${AGENTSTUDIO_URL}/agents" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}" \
  -H "Content-Type: application/json" \
  --data @"${AGENT_SPEC}" | jq
