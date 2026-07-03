#!/usr/bin/env bash
#
# Publish the Swedish NER model to the Hugging Face Hub as
# joelhagvall/maskera-sv-ner.
#
# This assembles a clean staging directory in the Transformers.js layout
# (root config/tokenizer + onnx/ with all three quantizations) plus the model
# card and NOTICE, then uploads it. The HF CLI handles large files (LFS)
# automatically, no git-lfs needed.
#
# Prereqs (one-time):
#   pip install -U "huggingface_hub[cli]"
#   hf auth login           # paste a WRITE token from hf.co/settings/tokens
#
# Usage:
#   ./scripts/publish-model.sh            # build staging dir + upload
#   DRY_RUN=1 ./scripts/publish-model.sh  # build + verify only, no upload
#
set -euo pipefail

REPO_ID="${REPO_ID:-joelhagvall/maskera-sv-ner}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/training/${MODEL_SRC:-student-v5-onnx}"  # complete export: config, tokenizer, all onnx
CARD="$ROOT/training/maskera-sv-ner-card"  # README.md + NOTICE
STAGE="$ROOT/training/.publish-maskera-sv-ner"

echo "==> Assembling staging dir: $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/onnx"

# Metadata (must travel with the weights for Transformers.js to load them).
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json vocab.txt; do
  cp "$SRC/$f" "$STAGE/$f"
done

# ONNX weights: q4 (default), q8 (int8), fp32 (full precision).
cp "$SRC/onnx/model_q4.onnx"        "$STAGE/onnx/model_q4.onnx"
cp "$SRC/onnx/model_quantized.onnx" "$STAGE/onnx/model_quantized.onnx"
cp "$SRC/onnx/model.onnx"           "$STAGE/onnx/model.onnx"

# Model card + attribution.
cp "$CARD/README.md" "$STAGE/README.md"
cp "$CARD/NOTICE"    "$STAGE/NOTICE"

echo "==> Staging contents:"
( cd "$STAGE" && find . -type f -exec du -h {} + | sort -k2 )

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "==> DRY_RUN set, staging built, skipping upload."
  echo "    Review $STAGE, then run without DRY_RUN to publish."
  exit 0
fi

command -v hf >/dev/null 2>&1 || {
  echo "ERROR: 'hf' CLI not found. Run: pip install -U \"huggingface_hub[cli]\"" >&2
  exit 1
}

echo "==> Uploading to https://huggingface.co/$REPO_ID"
hf upload "$REPO_ID" "$STAGE" . --repo-type model

echo "==> Done. Verify at https://huggingface.co/$REPO_ID"
echo "    Test:  createNerRecognizer({ model: \"$REPO_ID\", dtype: \"q4\" })"
