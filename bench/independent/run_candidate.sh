#!/bin/bash
# Parallelized independent 23,980-text benchmark runner for a candidate ONNX model.
# Safely writes ONLY to tmp/indep/preds-<tag>/ and tmp/indep/score-<tag>.json
# (never overwrites tmp/indep/preds/ baseline) and optionally runs the locked
# comparison holdout (tmp/indep/sealed_corpora/).
#
# Usage:
#   sh bench/independent/run_candidate.sh --model student-v22f-s777-onnx --tag v22f-s777 [--model-path training] [--with-sealed]
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

MODEL=""
TAG=""
MODEL_PATH="training"
WITH_SEALED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --model-path) MODEL_PATH="$2"; shift 2 ;;
    --with-sealed) WITH_SEALED=1; shift 1 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$MODEL" ] || [ -z "$TAG" ]; then
  echo "ERROR: --model and --tag are required" >&2
  exit 2
fi

if [ "$TAG" = "baseline" ] || [ "$TAG" = "preds" ]; then
  echo "ERROR: Refusing reserved tag '$TAG' to protect baseline predictions." >&2
  exit 2
fi

cd "$REPO"

if [ ! -f "$MODEL_PATH/$MODEL/onnx/model_q4.onnx" ]; then
  echo "ERROR: Missing model at $MODEL_PATH/$MODEL/onnx/model_q4.onnx" >&2
  exit 1
fi

PREDS_DIR="tmp/indep/preds-${TAG}"
SCORE_OUT="tmp/indep/score-${TAG}.json"
mkdir -p "$PREDS_DIR"

echo "== Running 23,980-text independent benchmark for $MODEL ($TAG) in parallel =="
for f in tmp/indep/corpora/*.jsonl; do
  MASKERA_MODEL="$MODEL" MASKERA_MODEL_PATH="$MODEL_PATH" \
    node bench/independent/run-maskera.mjs --out-dir "$PREDS_DIR" "$f" &
done
wait

node bench/independent/score.mjs --preds "$PREDS_DIR" --out "$SCORE_OUT"

python3 - "$SCORE_OUT" "$TAG" << 'EOF'
import json, sys
from pathlib import Path

score_path, tag = Path(sys.argv[1]), sys.argv[2]
d = json.loads(score_path.read_text())
s = d["summary"]["maskera"]
print(f"\n=== SUMMARY [{tag}] ===")
print(
    f"Namn={s['names']['maskedPct']:.1f}%  "
    f"Gemener={s['namesLowercase']['maskedPct']:.1f}%  "
    f"Platser={s['places']['maskedPct']:.1f}%  "
    f"Adresser={s['addresses']['maskedPct']:.1f}%  "
    f"Overmask={s['overMasking']['pct']:.1f}% ({s['overMasking']['withDetection']}/{s['overMasking']['sentences']})"
)
EOF

if [ "$WITH_SEALED" -eq 1 ]; then
  if [ ! -d "tmp/indep/sealed_corpora" ]; then
    echo "ERROR: Missing tmp/indep/sealed_corpora; run build_sealed_holdout.py first." >&2
    exit 1
  fi
  SEALED_TMP="tmp/indep/sealed_tmp_${TAG}"
  SEALED_DST="tmp/indep/sealed_preds/maskera-${TAG}"
  rm -rf "$SEALED_TMP"
  mkdir -p "$SEALED_TMP"
  echo "== Running locked comparison holdout for $MODEL ($TAG) =="
  for f in tmp/indep/sealed_corpora/*.jsonl; do
    MASKERA_MODEL="$MODEL" MASKERA_MODEL_PATH="$MODEL_PATH" \
      node bench/independent/run-maskera.mjs --out-dir "$SEALED_TMP" "$f" &
  done
  wait
  rm -rf "$SEALED_DST"
  mv "$SEALED_TMP/maskera" "$SEALED_DST"
  rmdir "$SEALED_TMP"
  node bench/independent/score_sealed.mjs \
    --corpora tmp/indep/sealed_corpora \
    --preds tmp/indep/sealed_preds \
    --out tmp/indep/sealed_score.json
fi
