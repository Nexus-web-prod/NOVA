#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-nova-7}"
BRANCH="${BRANCH:-ads}"
DEPLOY_COMMENT="${DEPLOY_COMMENT:-Nova ad format test page}"
WRANGLER_VERSION="${WRANGLER_VERSION:-4.112.0}"
TMP_DIR="${TMPDIR:-/tmp}"
export npm_config_cache="${npm_config_cache:-${TMP_DIR}/nova-npm-cache}"
WRANGLER=(npx -y "wrangler@${WRANGLER_VERSION}")

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TEST_DIR="${PROJECT_ROOT}/ad-test"

if [ ! -f "${TEST_DIR}/index.html" ]; then
  echo "Missing ${TEST_DIR}/index.html" >&2
  exit 1
fi

cd "${PROJECT_ROOT}"

echo "Deploying isolated Nova ad test page"
echo "Project: ${PROJECT_NAME}"
echo "Branch:  ${BRANCH}"

"${WRANGLER[@]}" pages deploy "${TEST_DIR}" \
  --project-name="${PROJECT_NAME}" \
  --branch="${BRANCH}" \
  --commit-message="${DEPLOY_COMMENT}" \
  --commit-dirty=true

echo
echo "Done. Test all placements at:"
echo "  https://${BRANCH}.${PROJECT_NAME}.pages.dev/"
