#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-nova-7}"
BRANCH="${BRANCH:-dev}"
DB_NAME="${DB_NAME:-nova-db}"
TMP_DIR="${TMPDIR:-/tmp}"
WRANGLER_VERSION="${WRANGLER_VERSION:-4.112.0}"
export npm_config_cache="${npm_config_cache:-${TMP_DIR}/nova-npm-cache}"
WRANGLER=(npx -y "wrangler@${WRANGLER_VERSION}")

cd "$(dirname "$0")"

RUNTIME_FILES=(
  _headers _redirects _worker.js index.html config.js store.js sw.js
  baremux-worker.js epoxy.mjs vortex.all.js vortex.bundle.js vortex.sync.js
  vortex.wasm.wasm games.json apps.json movies.json info.json whats-new.json favicon.webp
)
RUNTIME_DIRS=(assets baremux epoxy css js)

get_toml_db_id() {
  node -e 'const fs=require("fs"); const file="wrangler.toml"; if(!fs.existsSync(file)) process.exit(0); const s=fs.readFileSync(file,"utf8"); const m=s.match(/database_id\s*=\s*"([^"]+)"/); const id=m ? m[1] : ""; process.stdout.write(id && !/^REPLACE_WITH_/i.test(id) ? id : "");'
}

get_list_db_id() {
  local out_file="$1"
  node -e 'const fs=require("fs"); const name=process.argv[1]; const file=process.argv[2]; const raw=JSON.parse(fs.readFileSync(file,"utf8")); const buckets=[raw, raw.result, raw.databases, raw.d1_databases].filter(Boolean); let rows=[]; for (const b of buckets) rows=rows.concat(Array.isArray(b)?b:(Array.isArray(b.databases)?b.databases:(Array.isArray(b.result)?b.result:[]))); const hit=rows.find(r=>r && r.name===name); process.stdout.write(hit ? (hit.uuid || hit.id || hit.database_id || "") : "");' "${DB_NAME}" "${out_file}"
}

echo "==> Looking for D1 database: ${DB_NAME}"
LIST_JSON="${TMP_DIR}/nova-d1-list-$$.json"
if "${WRANGLER[@]}" d1 list --json > "${LIST_JSON}" 2>/dev/null; then
  DB_ID="$(get_list_db_id "${LIST_JSON}")"
else
  DB_ID=""
fi

if [ -z "${DB_ID}" ]; then
  DB_ID="$(get_toml_db_id)"
fi

if [ -z "${DB_ID}" ]; then
  echo "==> Creating D1 database: ${DB_NAME}"
  CREATE_OUT="${TMP_DIR}/nova-d1-create-$$.txt"
  set +e
  "${WRANGLER[@]}" d1 create "${DB_NAME}" 2>&1 | tee "${CREATE_OUT}"
  CREATE_STATUS="${PIPESTATUS[0]}"
  set -e
  DB_ID="$(node -e 'const fs=require("fs"); const s=fs.readFileSync(process.argv[1],"utf8"); const m=s.match(/database_id\\s*=\\s*\"([^\"]+)\"/) || s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i); process.stdout.write(m ? m[1] : "");' "${CREATE_OUT}")"
  if [ -z "${DB_ID}" ] && grep -qi "already exists" "${CREATE_OUT}"; then
    echo "==> Database already exists. Rechecking existing binding."
    if "${WRANGLER[@]}" d1 list --json > "${LIST_JSON}" 2>/dev/null; then
      DB_ID="$(get_list_db_id "${LIST_JSON}")"
    fi
    if [ -z "${DB_ID}" ]; then
      DB_ID="$(get_toml_db_id)"
    fi
  elif [ "${CREATE_STATUS}" -ne 0 ]; then
    exit "${CREATE_STATUS}"
  fi
fi

if [ -z "${DB_ID}" ]; then
  echo "Could not determine D1 database id. Copy it into wrangler.toml manually and rerun." >&2
  exit 1
fi

echo "==> Binding DB=${DB_NAME} (${DB_ID}) in wrangler.toml"
node -e 'const fs=require("fs"); const file="wrangler.toml"; const id=process.argv[1]; let s=fs.readFileSync(file,"utf8"); if (/database_id\s*=/.test(s)) s=s.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${id}"`); else s += `\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "nova-db"\ndatabase_id = "${id}"\n`; fs.writeFileSync(file,s);' "${DB_ID}"

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
  echo "Wrangler can hang while macOS downloads these during upload."
  echo
  echo "Run this in Terminal first:"
  echo "  brctl download \"$(pwd)\""
  echo
  echo "Then run:"
  echo "  ./deploy-pages-d1.sh"
  echo
  echo "If the files are already downloaded and you still want to force deploy:"
  echo "  SKIP_PLACEHOLDER_CHECK=1 ./deploy-pages-d1.sh"
  exit 2
fi

echo "==> Applying D1 schema"
"${WRANGLER[@]}" d1 execute "${DB_NAME}" --remote --file=D1_SCHEMA.sql

if [ "${SKIP_VOICE_DEPLOY:-0}" = "1" ]; then
  echo "==> Leaving the existing voice room coordinator unchanged"
else
  echo "==> Deploying Supernova voice room coordinator"
  "${WRANGLER[@]}" deploy --config voice-worker/wrangler.toml
fi

echo "==> Building secure runtime bundle"
DEPLOY_DIR="$(mktemp -d "${TMP_DIR}/nova-pages-runtime.XXXXXX")"
cleanup() {
  rm -f "${LIST_JSON:-}" "${CREATE_OUT:-}"
  rm -rf "${DEPLOY_DIR:-}"
}
trap cleanup EXIT

for file in "${RUNTIME_FILES[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "Missing required runtime file: ${file}" >&2
    exit 1
  fi
  cp "${file}" "${DEPLOY_DIR}/${file}"
done

for dir in "${RUNTIME_DIRS[@]}"; do
  if [ ! -d "${dir}" ]; then
    echo "Missing required runtime directory: ${dir}" >&2
    exit 1
  fi
  cp -R "${dir}" "${DEPLOY_DIR}/${dir}"
done

rm -f \
  "${DEPLOY_DIR}/js/nova-admin.js" \
  "${DEPLOY_DIR}/js/nova-admin-rewards.js" \
  "${DEPLOY_DIR}/js/admin.js" \
  "${DEPLOY_DIR}/js/nova-badges-admin-grants.js"
find "${DEPLOY_DIR}" -type f -name '*.map' -delete

if find "${DEPLOY_DIR}" -type f \( -name '*.sql' -o -name '*.sh' -o -name '*.toml' -o -name '*.md' \) | grep -q .; then
  echo "Secure deploy check failed: internal operational files entered the runtime bundle." >&2
  exit 1
fi

echo "==> Deploying Cloudflare Pages project ${PROJECT_NAME} (${BRANCH})"
"${WRANGLER[@]}" pages deploy "${DEPLOY_DIR}" --project-name="${PROJECT_NAME}" --branch="${BRANCH}"

echo
echo "Done. Open:"
echo "  https://${BRANCH}.${PROJECT_NAME}.pages.dev/api/health"
echo "Expected: ok=true, dbBound=true, voiceBound=true, schemaVersion=715"
