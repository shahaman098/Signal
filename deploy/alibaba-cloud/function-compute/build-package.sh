#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist/alibaba-function-compute"
STAGE_DIR="${OUT_DIR}/signal-api-fc"
ZIP_PATH="${OUT_DIR}/signal-api-fc.zip"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

need_cmd npm
need_cmd zip

printf '== Building Signal API ==\n'
npm --prefix "${ROOT_DIR}" run build --workspace @signal/api

printf '== Installing production dependencies ==\n'
rm -rf "${OUT_DIR}"
mkdir -p "${STAGE_DIR}/apps/api"

cp "${ROOT_DIR}/deploy/alibaba-cloud/function-compute/bootstrap" "${STAGE_DIR}/bootstrap"
cp "${ROOT_DIR}/apps/api/package.json" "${STAGE_DIR}/apps/api/package.json"
cp -R "${ROOT_DIR}/apps/api/dist" "${STAGE_DIR}/apps/api/dist"

npm --prefix "${STAGE_DIR}/apps/api" install --omit=dev --package-lock=false
chmod +x "${STAGE_DIR}/bootstrap"

printf '== Creating Function Compute zip ==\n'
(cd "${STAGE_DIR}" && zip -qr "${ZIP_PATH}" .)

printf 'Package created: %s\n' "${ZIP_PATH}"
