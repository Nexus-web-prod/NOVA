#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"
DEST="../nova-preview-updated-3-deploy-clean"

rm -rf "${DEST}"
mkdir -p "${DEST}"

python3 - <<'PY'
import os
import shutil
from pathlib import Path

src = Path(".")
dest = Path("../nova-preview-updated-3-deploy-clean")
skipped = []
copied = 0

for path in src.rglob("*"):
    rel = path.relative_to(src)
    if str(rel).startswith(".wrangler/"):
        continue
    target = dest / rel
    if path.is_dir():
        target.mkdir(parents=True, exist_ok=True)
        continue
    try:
        st = path.stat()
    except OSError:
        skipped.append(str(rel))
        continue
    if st.st_size > 0 and getattr(st, "st_blocks", 1) == 0:
        skipped.append(str(rel))
        continue
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    copied += 1

print(f"Copied local files: {copied}")
print(f"Skipped cloud placeholders: {len(skipped)}")
if skipped:
    report = dest / "CLOUD_PLACEHOLDERS_SKIPPED.txt"
    report.write_text("\n".join(skipped) + "\n")
    print(f"Wrote skipped list: {report}")
    print("First few skipped:")
    for item in skipped[:20]:
        print(item)
PY

cp wrangler.toml "${DEST}/wrangler.toml"
mkdir -p "${DEST}/scripts/deploy"
cp scripts/deploy/deploy-pages-turso.sh "${DEST}/scripts/deploy/deploy-pages-turso.sh"
chmod +x "${DEST}/scripts/deploy/deploy-pages-turso.sh"

echo
echo "Clean deploy folder:"
echo "  $(cd "${DEST}" && pwd)"
echo
echo "If the skipped list is not important assets, deploy with:"
echo "  cd \"$(cd "${DEST}" && pwd)\""
echo "  SKIP_PLACEHOLDER_CHECK=1 ./scripts/deploy/deploy-pages-turso.sh"
