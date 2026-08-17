#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Asking macOS to download this whole Nova folder"
brctl download "$(pwd)" >/dev/null 2>&1 || true

echo "==> Forcing placeholder files to materialize"
python3 - <<'PY'
import os
import subprocess
import sys

root = "."
placeholders = []
for dirpath, dirnames, filenames in os.walk(root):
    if dirpath.startswith("./.wrangler"):
        continue
    for name in filenames:
        path = os.path.join(dirpath, name)
        try:
            st = os.stat(path)
        except OSError:
            continue
        if st.st_size > 0 and getattr(st, "st_blocks", 1) == 0:
            placeholders.append(path)

print(f"Found {len(placeholders)} placeholder files.")
if not placeholders:
    sys.exit(0)

def force_read(path, seconds=8):
    import signal

    def timeout(_signum, _frame):
        raise TimeoutError(path)

    old = signal.signal(signal.SIGALRM, timeout)
    signal.alarm(seconds)
    try:
        with open(path, "rb") as f:
            while f.read(1024 * 1024):
                pass
        return True
    except Exception:
        return False
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)

for i, path in enumerate(placeholders, 1):
    if i == 1 or i % 25 == 0 or i == len(placeholders):
        print(f"[{i}/{len(placeholders)}] {path}")
    try:
        subprocess.run(
            ["brctl", "download", path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=8
        )
    except Exception:
        pass
    force_read(path)

left = []
for path in placeholders:
    try:
        st = os.stat(path)
    except OSError:
        continue
    if st.st_size > 0 and getattr(st, "st_blocks", 1) == 0:
        left.append(path)

print(f"Remaining placeholders: {len(left)}")
if left:
    print("First few still not local:")
    for path in left[:12]:
        print(path)
    sys.exit(2)
PY

echo "Done. Now run:"
echo "  ./deploy-pages-d1.sh"
