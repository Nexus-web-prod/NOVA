#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if "${SCRIPT_DIR}/deploy.sh"; then
  # Finder-launched .command windows can remain at "Process completed" even
  # after the shell exits. Close the active Terminal window after success.
  osascript -e 'tell application "Terminal" to close front window' >/dev/null 2>&1 &
  exit 0
else
  deploy_status=$?
fi

echo
echo "Deployment stopped with an error. This window will stay open so you can read it."
pause_on_error() {
  echo
  printf "Press Return to close this window. "
  IFS= read -r _ || true
}
pause_on_error
exit "${deploy_status}"
