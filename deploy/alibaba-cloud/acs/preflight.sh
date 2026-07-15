#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

printf '== Alibaba Cloud deploy preflight ==\n'

need_cmd docker
need_cmd kubectl
need_cmd node

docker info >/dev/null 2>&1 || fail "Docker daemon is not available"

if ! kubectl config current-context >/dev/null 2>&1; then
  fail "kubectl has no current context configured"
fi

CURRENT_CONTEXT="$(kubectl config current-context)"
printf 'kubectl context: %s\n' "$CURRENT_CONTEXT"

if [[ "${CURRENT_CONTEXT}" != *aliyun* ]] && [[ "${CURRENT_CONTEXT}" != *acs* ]] && [[ "${CURRENT_CONTEXT}" != *ack* ]]; then
  printf 'WARN: current context does not look like an Alibaba Cloud cluster\n' >&2
fi

for var in ACR_REGISTRY ACR_NAMESPACE ACR_USERNAME ACR_PASSWORD CREATIVE_INTEL_API_BASE_URL CREATIVE_INTEL_BRAND_ID CREATIVE_INTEL_BRAND_NAME CREATIVE_INTEL_CATEGORY; do
  if [[ -z "${!var:-}" ]]; then
    printf 'MISSING_ENV %s\n' "$var"
  else
    printf 'OK_ENV %s\n' "$var"
  fi
done

if [[ "${IMAGE_TAG:-}" == "latest" ]]; then
  fail "IMAGE_TAG must not be latest for a submission-grade deployment"
fi

printf 'Preflight complete.\n'
