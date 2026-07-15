#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "Missing required environment variable: ${name}"
}

default_image_tag() {
  if command -v git >/dev/null 2>&1 && git -C "${ROOT_DIR}" rev-parse --short HEAD >/dev/null 2>&1; then
    local sha dirty=""
    sha="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
    if ! git -C "${ROOT_DIR}" diff --quiet --ignore-submodules HEAD --; then
      dirty="-dirty"
    fi
    printf '%s%s\n' "${sha}" "${dirty}"
    return
  fi
  date -u +%Y%m%d%H%M%S
}

need_cmd docker

for var in MCP_ACR_REGISTRY MCP_ACR_NAMESPACE MCP_ACR_USERNAME MCP_ACR_PASSWORD; do
  require_env "$var"
done

IMAGE_NAME="${IMAGE_NAME:-signal-mcp}"
IMAGE_TAG="${IMAGE_TAG:-$(default_image_tag)}"
IMAGE_REF="${MCP_ACR_REGISTRY}/${MCP_ACR_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"

[[ "${IMAGE_TAG}" != "latest" ]] || fail "IMAGE_TAG must be an immutable non-latest tag."

printf '== Building remote MCP image ==\n'
docker build \
  --platform linux/amd64 \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "${ROOT_DIR}/apps/mcp/Dockerfile" \
  "${ROOT_DIR}"

printf '== Logging into Alibaba Cloud Container Registry ==\n'
printf '%s' "${MCP_ACR_PASSWORD}" | docker login --username "${MCP_ACR_USERNAME}" --password-stdin "${MCP_ACR_REGISTRY}"

printf '== Tagging and pushing image ==\n'
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${IMAGE_REF}"
docker push "${IMAGE_REF}"

printf '\nImage pushed:\n%s\n' "${IMAGE_REF}"
printf 'Set mcp_container_image=%s in deploy/alibaba-cloud/terraform/terraform.tfvars and re-run terraform apply.\n' "${IMAGE_REF}"
