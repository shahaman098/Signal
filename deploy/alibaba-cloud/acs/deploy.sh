#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST_TEMPLATE="${ROOT_DIR}/deploy/alibaba-cloud/acs/signal-api.yaml"

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
need_cmd kubectl
need_cmd mktemp
need_cmd sed

for var in \
  ACR_REGISTRY \
  ACR_NAMESPACE \
  ACR_USERNAME \
  ACR_PASSWORD \
  CREATIVE_INTEL_API_BASE_URL \
  CREATIVE_INTEL_BRAND_ID \
  CREATIVE_INTEL_BRAND_NAME \
  CREATIVE_INTEL_CATEGORY \
  DASHSCOPE_API_KEY \
  WORKSPACE_ID
do
  require_env "$var"
done

IMAGE_NAME="${IMAGE_NAME:-signal-api}"
IMAGE_TAG="${IMAGE_TAG:-$(default_image_tag)}"
K8S_NAMESPACE="${K8S_NAMESPACE:-signal}"
CREATIVE_INTEL_TIMEOUT_MS="${CREATIVE_INTEL_TIMEOUT_MS:-30000}"
QWEN_MODEL="${QWEN_MODEL:-qwen-plus}"
IMAGE_REF="${ACR_REGISTRY}/${ACR_NAMESPACE}/${IMAGE_NAME}:${IMAGE_TAG}"

[[ "${IMAGE_TAG}" != "latest" ]] || fail "IMAGE_TAG must be an immutable non-latest tag."

printf '== Building image ==\n'
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" -f "${ROOT_DIR}/apps/api/Dockerfile" "${ROOT_DIR}"

printf '== Logging into Alibaba Cloud Container Registry ==\n'
printf '%s' "${ACR_PASSWORD}" | docker login --username "${ACR_USERNAME}" --password-stdin "${ACR_REGISTRY}"

printf '== Tagging and pushing image ==\n'
docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${IMAGE_REF}"
docker push "${IMAGE_REF}"

printf '== Creating namespace and runtime secret ==\n'
kubectl create namespace "${K8S_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic signal-api-secrets \
  --namespace "${K8S_NAMESPACE}" \
  --from-literal=CREATIVE_INTEL_API_BASE_URL="${CREATIVE_INTEL_API_BASE_URL}" \
  --from-literal=CREATIVE_INTEL_BRAND_ID="${CREATIVE_INTEL_BRAND_ID}" \
  --from-literal=CREATIVE_INTEL_BRAND_NAME="${CREATIVE_INTEL_BRAND_NAME}" \
  --from-literal=CREATIVE_INTEL_CATEGORY="${CREATIVE_INTEL_CATEGORY}" \
  --from-literal=CREATIVE_INTEL_TIMEOUT_MS="${CREATIVE_INTEL_TIMEOUT_MS}" \
  --from-literal=DASHSCOPE_API_KEY="${DASHSCOPE_API_KEY}" \
  --from-literal=WORKSPACE_ID="${WORKSPACE_ID}" \
  --from-literal=QWEN_MODEL="${QWEN_MODEL}" \
  --dry-run=client -o yaml | kubectl apply -f -

printf '== Applying workload ==\n'
TMP_MANIFEST="$(mktemp)"
trap 'rm -f "${TMP_MANIFEST}"' EXIT
sed \
  -e "s|namespace: signal|namespace: ${K8S_NAMESPACE}|g" \
  -e "s|REPLACE_WITH_ACR_IMAGE|${IMAGE_REF}|g" \
  "${MANIFEST_TEMPLATE}" > "${TMP_MANIFEST}"

kubectl apply -f "${TMP_MANIFEST}"

printf '== Waiting for rollout ==\n'
kubectl rollout status deployment/signal-api -n "${K8S_NAMESPACE}" --timeout=180s

printf '== Service status ==\n'
kubectl get service signal-api -n "${K8S_NAMESPACE}"

printf '\nDeployment complete.\n'
printf 'Health check command:\n'
printf 'kubectl port-forward svc/signal-api 4000:80 -n %s\n' "${K8S_NAMESPACE}"
