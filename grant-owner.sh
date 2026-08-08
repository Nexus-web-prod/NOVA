#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${DB_NAME:-nova-db}"
USERNAME="${1:-}"

cd "$(dirname "$0")"

if [[ ! "${USERNAME}" =~ ^[a-z0-9_]{3,20}$ ]]; then
  echo "Usage: CONFIRM_OWNER=<username> $0 <username>" >&2
  echo "Usernames must be 3-20 lowercase letters, numbers, or underscores." >&2
  exit 2
fi

if [ "${CONFIRM_OWNER:-}" != "${USERNAME}" ]; then
  echo "This grants permanent owner access to ${USERNAME} in ${DB_NAME}." >&2
  echo "Run: CONFIRM_OWNER=${USERNAME} $0 ${USERNAME}" >&2
  exit 2
fi

echo "==> Granting owner access to ${USERNAME} in remote D1 database ${DB_NAME}"
npx wrangler d1 execute "${DB_NAME}" --remote --command="INSERT OR IGNORE INTO user_roles(user_id,role) SELECT id,'owner' FROM users WHERE lower(username)='${USERNAME}';"

echo "==> Verifying owner role"
npx wrangler d1 execute "${DB_NAME}" --remote --command="SELECT u.username,r.role,r.created_at FROM user_roles r JOIN users u ON u.id=r.user_id WHERE lower(u.username)='${USERNAME}' AND r.role='owner';"

echo "If the verification returned no row, register ${USERNAME} first and run this command again."
