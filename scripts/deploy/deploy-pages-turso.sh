#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-nova-7}"
BRANCH="${BRANCH:-dev}"
PAGES_ENV="${PAGES_ENV:-preview}"
DEPLOY_COMMENT="${DEPLOY_COMMENT:-pushed by nova deploy cmd}"
TMP_DIR="${TMPDIR:-/tmp}"
WRANGLER_VERSION="${WRANGLER_VERSION:-4.112.0}"
export npm_config_cache="${npm_config_cache:-${TMP_DIR}/nova-npm-cache}"
WRANGLER=(npx -y "wrangler@${WRANGLER_VERSION}")

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

RUNTIME_FILES=(
  _headers _redirects _worker.js ads.txt
)
RUNTIME_DIRS=(website proxy)

echo "==> Checking Turso secret for Cloudflare Pages (${PAGES_ENV})"
SECRET_LIST="${TMP_DIR}/nova-pages-secrets-$$.txt"
if ! "${WRANGLER[@]}" pages secret list --project-name="${PROJECT_NAME}" --env="${PAGES_ENV}" >"${SECRET_LIST}" 2>/dev/null; then
  echo "Could not read Pages secrets. Make sure Wrangler is logged into the correct Cloudflare account." >&2
  exit 1
fi
if ! grep -q "TURSO_AUTH_TOKEN" "${SECRET_LIST}"; then
  echo
  echo "Missing TURSO_AUTH_TOKEN for ${PAGES_ENV}. Set it once with:"
  echo "  npx wrangler pages secret put TURSO_AUTH_TOKEN --project-name ${PROJECT_NAME} --env ${PAGES_ENV}"
  echo
  echo "Paste the Turso database token when Wrangler asks, then rerun this deploy script."
  rm -f "${SECRET_LIST}"
  exit 2
fi

echo "==> Checking deploy files"
PLACEHOLDER_COUNT="$(python3 - "${RUNTIME_FILES[@]}" "${RUNTIME_DIRS[@]}" <<'PY'
import os
import sys
count = 0
for candidate in sys.argv[1:]:
    paths = []
    if os.path.isdir(candidate):
        for root, dirs, files in os.walk(candidate):
            paths.extend(os.path.join(root, name) for name in files)
    else:
        paths.append(candidate)
    for path in paths:
        try:
            st = os.stat(path)
        except OSError:
            continue
        if st.st_size > 0 and getattr(st, "st_blocks", 1) == 0:
            count += 1
print(count)
PY
)"
if [ "${PLACEHOLDER_COUNT}" != "0" ] && [ "${SKIP_PLACEHOLDER_CHECK:-0}" != "1" ]; then
  echo
  echo "Found ${PLACEHOLDER_COUNT} cloud placeholder files required by Nova."
  echo "Run: brctl download \"$(pwd)\""
  echo "Then rerun: SKIP_VOICE_DEPLOY=1 ./scripts/deploy/deploy-pages-turso.sh"
  rm -f "${SECRET_LIST}"
  exit 3
fi

if [ "${SKIP_VOICE_DEPLOY:-0}" = "1" ]; then
  echo "==> Leaving the existing voice room coordinator unchanged"
else
  echo "==> Deploying Supernova voice room coordinator"
  "${WRANGLER[@]}" deploy --config voice-worker/wrangler.toml
fi

echo "==> Building secure runtime bundle"
DEPLOY_DIR="$(mktemp -d "${TMP_DIR}/nova-pages-runtime.XXXXXX")"
cleanup() {
  rm -f "${SECRET_LIST:-}"
  rm -rf "${DEPLOY_DIR:-}"
}
trap cleanup EXIT

for file in "${RUNTIME_FILES[@]}"; do
  if [ ! -f "${file}" ]; then echo "Missing required runtime file: ${file}" >&2; exit 1; fi
  cp "${file}" "${DEPLOY_DIR}/${file}"
done
for dir in "${RUNTIME_DIRS[@]}"; do
  if [ ! -d "${dir}" ]; then echo "Missing required runtime directory: ${dir}" >&2; exit 1; fi
  cp -R "${dir}" "${DEPLOY_DIR}/${dir}"
done

rm -f \
  "${DEPLOY_DIR}/website/js/nova-admin.js" \
  "${DEPLOY_DIR}/website/js/nova-admin-rewards.js" \
  "${DEPLOY_DIR}/website/js/admin.js" \
  "${DEPLOY_DIR}/website/js/nova-badges-admin-grants.js"
find "${DEPLOY_DIR}" -type f -name '*.map' -delete

if find "${DEPLOY_DIR}" -type f \( -name '*.sql' -o -name '*.sh' -o -name '*.toml' -o -name '*.md' \) | grep -q .; then
  echo "Secure deploy check failed: internal operational files entered the runtime bundle." >&2
  exit 1
fi

if [ "${PAGES_ENV}" = "production" ]; then
  echo "==> Deploying Cloudflare Pages project ${PROJECT_NAME} (production)"
  "${WRANGLER[@]}" pages deploy "${DEPLOY_DIR}" --project-name="${PROJECT_NAME}" --branch="production" --commit-message="${DEPLOY_COMMENT}" --commit-dirty=true
  TEST_URL="https://${PROJECT_NAME}.pages.dev/api/health"
else
  echo "==> Deploying Cloudflare Pages project ${PROJECT_NAME} (${BRANCH})"
  "${WRANGLER[@]}" pages deploy "${DEPLOY_DIR}" --project-name="${PROJECT_NAME}" --branch="${BRANCH}" --commit-message="${DEPLOY_COMMENT}" --commit-dirty=true
  TEST_URL="https://${BRANCH}.${PROJECT_NAME}.pages.dev/api/health"
fi

echo
echo "Done. Test:"
echo "  ${TEST_URL}"
echo "Expected backend: turso-libsql"
