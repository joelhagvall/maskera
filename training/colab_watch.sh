#!/bin/bash
# Reusable local orchestrator for running Maskera sweeps detached on a Colab GPU VM.
# Immune to Colab's 1-hour websocket disconnects: packages a minimal git-tracked
# snapshot (~3-5 MB), launches detached over SSH via setsid, polls until completion,
# downloads & verifies artifacts, and optionally stops or keeps the VM warm.
#
# Usage:
#   sh training/colab_watch.sh --session maskera-fast --prefix v22f [--preset training/presets/v22f.env] [--prose training/data/llm_prose_pool_v22f.json] [--poll 45] [--stop]
#   sh training/colab_watch.sh --dry-run-snapshot /tmp/test-snapshot.tar.gz
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

SESSION=""
PREFIX=""
PRESET=""
PROSE_FILE=""
POLL_SECS=45
STOP_AFTER=0
DRY_RUN_SNAPSHOT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --session) SESSION="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --prose) PROSE_FILE="$2"; shift 2 ;;
    --poll) POLL_SECS="$2"; shift 2 ;;
    --stop) STOP_AFTER=1; shift 1 ;;
    --dry-run-snapshot) DRY_RUN_SNAPSHOT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

build_snapshot() {
  local out_tar="$1"
  local list_file
  list_file=$(mktemp)
  (
    cd "$REPO"
    {
      git ls-files | grep -v '^apps/demo/public/models/' | grep -v '^bench/\.venv/'
      for extra in training/run_gpu_sweep.sh training/colab_runner.py training/gen_llm_prose.py training/gen_llm_prose_expand.py; do
        [ -f "$extra" ] && echo "$extra"
      done
      if [ -n "$PRESET" ] && [ -f "$PRESET" ]; then
        echo "$PRESET"
      fi
      if [ -n "$PROSE_FILE" ] && [ -f "$PROSE_FILE" ]; then
        echo "$PROSE_FILE"
      fi
    } | sort -u > "$list_file"
    COPYFILE_DISABLE=1 tar -czf "$out_tar" -T "$list_file"
  )
  rm -f "$list_file"
}

if [ -n "$DRY_RUN_SNAPSHOT" ]; then
  build_snapshot "$DRY_RUN_SNAPSHOT"
  ls -lh "$DRY_RUN_SNAPSHOT"
  exit 0
fi

if [ -z "$SESSION" ] || [ -z "$PREFIX" ]; then
  echo "ERROR: --session and --prefix are required" >&2
  exit 2
fi

mkdir -p "$REPO/training/.tmp"
SRC_TAR="$REPO/training/.tmp/${PREFIX}-src.tar.gz"
LOCAL_TAR="$REPO/training/.tmp/${PREFIX}-artifacts.tar.gz"

echo "== Packaging minimal repo snapshot for $PREFIX =="
rm -f "$SRC_TAR"
build_snapshot "$SRC_TAR"
ls -lh "$SRC_TAR"

echo "== Uploading snapshot to $SESSION =="
colab upload -s "$SESSION" "$SRC_TAR" /content/maskera-src.tar.gz
colab upload -s "$SESSION" "$REPO/training/colab_runner.py" /content/colab_runner.py

PRESET_ARG=""
if [ -n "$PRESET" ]; then
  PRESET_ARG="--preset $PRESET"
fi

echo "== Launching detached sweep '$PREFIX' on $SESSION =="
colab ssh -s "$SESSION" -- "cat > /content/run_${PREFIX}.sh << 'EOF'
#!/bin/bash
set -e
python3 /content/colab_runner.py --prefix ${PREFIX} ${PRESET_ARG}
EOF
chmod +x /content/run_${PREFIX}.sh
rm -f /content/${PREFIX}-artifacts.tar.gz /content/${PREFIX}.done /content/${PREFIX}.rc /content/${PREFIX}.log
setsid bash -c '/content/run_${PREFIX}.sh > /content/${PREFIX}.log 2>&1; echo \$? > /content/${PREFIX}.rc; touch /content/${PREFIX}.done' < /dev/null > /dev/null 2>&1 &"

sleep 12
colab ssh -s "$SESSION" -- "tail -n 25 /content/${PREFIX}.log || true"

echo "== Polling every ${POLL_SECS}s until remote sweep completes =="
while true; do
  STATUS=$(perl -e 'alarm 25; exec @ARGV' colab ssh -s "$SESSION" -- "if [ -f /content/${PREFIX}.done ]; then echo DONE:\$(cat /content/${PREFIX}.rc); else echo RUNNING; tail -n 3 /content/${PREFIX}.log 2>/dev/null; fi" 2>&1 || echo "SSH_ERR")
  echo "[$(date +%H:%M:%S)] $STATUS"
  if echo "$STATUS" | grep -q "^DONE:"; then
    RC=$(echo "$STATUS" | grep "^DONE:" | head -n 1 | cut -d: -f2)
    echo "Remote finished with RC=$RC"
    if [ "$RC" != "0" ]; then
      echo "=== REMOTE LOG TAIL ==="
      colab ssh -s "$SESSION" -- "tail -n 80 /content/${PREFIX}.log" || true
      exit 1
    fi
    break
  fi
  sleep "$POLL_SECS"
done

echo "== Downloading /content/${PREFIX}-artifacts.tar.gz =="
DL_OK=0
for attempt in 1 2 3; do
  rm -f "$LOCAL_TAR"
  if colab download -s "$SESSION" "/content/${PREFIX}-artifacts.tar.gz" "$LOCAL_TAR" && tar -tzf "$LOCAL_TAR" >/dev/null 2>&1; then
    DL_OK=1
    break
  fi
  echo "Download attempt $attempt failed, retrying in 10s..."
  sleep 10
done

if [ "$DL_OK" -ne 1 ]; then
  echo "ERROR: Could not download valid ${PREFIX}-artifacts.tar.gz; leaving $SESSION alive." >&2
  exit 1
fi

ls -lh "$LOCAL_TAR"
tar -xzf "$LOCAL_TAR" -C "$REPO"
rm -f "$SRC_TAR"

if [ "$STOP_AFTER" -eq 1 ]; then
  echo "== Stopping Colab session $SESSION =="
  colab stop -s "$SESSION"
  colab sessions
fi

echo "SWEEP_DONE:${PREFIX}"
