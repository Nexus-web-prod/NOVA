#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-nova-7}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

configured=0
for slot in 1 2 3 4; do
  printf "Google Gemini API key %s (leave blank to skip): " "${slot}"
  IFS= read -r -s key
  printf "\n"
  if [ -z "${key}" ]; then
    continue
  fi
  if [ "${#key}" -lt 20 ]; then
    echo "Key ${slot} is too short; nothing was uploaded for that slot." >&2
    exit 1
  fi
  printf "%s" "${key}" | npx wrangler pages secret put "GEMINI_API_KEY_${slot}" --project-name="${PROJECT_NAME}"
  key=""
  configured=$((configured + 1))
done

if [ "${configured}" -eq 0 ]; then
  echo "No keys were configured." >&2
  exit 1
fi

echo
echo "Configured ${configured} private Gemini key(s) for ${PROJECT_NAME}."
echo "Deploy Nova, then confirm /api/health reports aiConfigured=true."
