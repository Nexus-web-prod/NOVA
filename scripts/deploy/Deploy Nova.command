#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
pause_before_close() {
  echo
  printf "Press Return to close this window. "
  IFS= read -r _ || true
}
trap pause_before_close EXIT

"${SCRIPT_DIR}/deploy.sh"
