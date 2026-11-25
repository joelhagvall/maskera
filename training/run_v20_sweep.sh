#!/bin/sh
# Privacy-clean Maskera v20 GPU sweep runner (Colab A100/L4 or local CUDA/MPS).
#
# Pipeline:
#   1. Generate and attest v20 synthetic-only data (scaled + clinical,
#      homograph and register-precision contrast families).
#   2. Train a 3-seed KB-BERT teacher ensemble (bf16 on CUDA) with resume
#      support so checkpoints on Google Drive are reused across restarts.
#   3. Trim primary teacher vocab to 20k and verify zero rare-surname leaks.
#   4. Distill and export a comparison sweep:
#        - 43 MB full student across 3 seeds (1337, 2024, 42)
#        - 43 MB student with hidden-state cosine distillation (weight 0.25)
#        - Low-rank students (rank 256 -> ~35 MB, rank 192 -> ~31 MB)
#   5. Grade every candidate (+ shipped v19 baseline if present) on all
#      release gates and diagnostic corpora via training/grade_candidate.mjs.
#
# Usage:
#   sh training/run_v20_sweep.sh
#   DRIVE_OUT=/content/drive/MyDrive/maskera-v20 sh training/run_v20_sweep.sh
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$SCRIPT_DIR"

export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
if [ -n "${PY:-}" ]; then
  :
elif [ -x ".venv/bin/python" ]; then
  PY=.venv/bin/python
else
  PY=python3
fi

CANDIDATE_PREFIX=${CANDIDATE_PREFIX:-v20b}
TEACHER_SEEDS=${TEACHER_SEEDS:-"1337 2024 42"}
STUDENT_SEEDS=${STUDENT_SEEDS:-"1337 2024 42"}
LOWRANK_RANKS=${LOWRANK_RANKS:-"256 192"}
RUN_HIDDEN_DISTILL=${RUN_HIDDEN_DISTILL:-1}
DRIVE_OUT=${DRIVE_OUT:-""}

# v20b dataset configuration (all synthetic, deterministic, fail-closed audited)
# Hard negatives restored to ~5.2% share (5600/108400) to protect the 100% ADR gate.
SYNTHETIC_TRAIN_ROWS=${SYNTHETIC_TRAIN_ROWS:-90000}
SYNTHETIC_VAL_ROWS=${SYNTHETIC_VAL_ROWS:-5000}
BALANCED_REPLAY_TRAIN_ROWS=${BALANCED_REPLAY_TRAIN_ROWS:-2400}
BALANCED_REPLAY_VAL_ROWS=${BALANCED_REPLAY_VAL_ROWS:-300}
HARD_NEGATIVE_TRAIN_ROWS=${HARD_NEGATIVE_TRAIN_ROWS:-5600}
HARD_NEGATIVE_VAL_ROWS=${HARD_NEGATIVE_VAL_ROWS:-560}
CLINICAL_CONTRAST_TRAIN_ROWS=${CLINICAL_CONTRAST_TRAIN_ROWS:-4000}
CLINICAL_CONTRAST_VAL_ROWS=${CLINICAL_CONTRAST_VAL_ROWS:-400}
HOMOGRAPH_CONTRAST_TRAIN_ROWS=${HOMOGRAPH_CONTRAST_TRAIN_ROWS:-2400}
HOMOGRAPH_CONTRAST_VAL_ROWS=${HOMOGRAPH_CONTRAST_VAL_ROWS:-240}
REGISTER_PRECISION_TRAIN_ROWS=${REGISTER_PRECISION_TRAIN_ROWS:-4000}
REGISTER_PRECISION_VAL_ROWS=${REGISTER_PRECISION_VAL_ROWS:-400}

export BALANCED_REPLAY_TRAIN_ROWS BALANCED_REPLAY_VAL_ROWS
export HARD_NEGATIVE_TRAIN_ROWS HARD_NEGATIVE_VAL_ROWS
export CLINICAL_CONTRAST_TRAIN_ROWS CLINICAL_CONTRAST_VAL_ROWS
export HOMOGRAPH_CONTRAST_TRAIN_ROWS HOMOGRAPH_CONTRAST_VAL_ROWS
export REGISTER_PRECISION_TRAIN_ROWS REGISTER_PRECISION_VAL_ROWS

# CUDA-friendly defaults (safe on A100/L4/T4; override via env if needed)
export MASKERA_PRECISION=${MASKERA_PRECISION:-auto}
export MASKERA_TRAIN_BATCH=${MASKERA_TRAIN_BATCH:-32}
export MASKERA_TRAIN_EPOCHS=${MASKERA_TRAIN_EPOCHS:-3}
export MASKERA_WARMUP_RATIO=${MASKERA_WARMUP_RATIO:-0.06}
export MASKERA_LR_SCHEDULER=${MASKERA_LR_SCHEDULER:-cosine}
export MASKERA_DISTILL_BATCH=${MASKERA_DISTILL_BATCH:-32}
export MASKERA_DISTILL_EPOCHS=${MASKERA_DISTILL_EPOCHS:-4}
export MASKERA_NUM_WORKERS=${MASKERA_NUM_WORKERS:-2}

sync_out() {
  src=$1
  if [ -n "$DRIVE_OUT" ]; then
    mkdir -p "$DRIVE_OUT"
    rm -rf "$DRIVE_OUT/$src"
    cp -r "$src" "$DRIVE_OUT/$src"
  fi
}

restore_if_present() {
  target=$1
  if [ ! -d "$target" ] && [ -n "$DRIVE_OUT" ] && [ -d "$DRIVE_OUT/$target" ]; then
    echo "Restoring cached $target from $DRIVE_OUT..."
    cp -r "$DRIVE_OUT/$target" "$target"
  fi
}

echo "=== [1/5] Generate and audit v20 privacy-clean synthetic data ==="
mkdir -p data
node generate_data.mjs "$SYNTHETIC_TRAIN_ROWS" "$SYNTHETIC_VAL_ROWS"
node audit_data.mjs
node privacy_attestation.mjs
node verify_attestation.mjs data/privacy-attestation.json
node --test privacy_guard.test.mjs privacy_attestation.test.mjs
if [ -n "$DRIVE_OUT" ]; then
  mkdir -p "$DRIVE_OUT/data"
  cp data/source-manifest.json data/privacy-attestation.json "$DRIVE_OUT/data/"
fi

echo "=== [2/5] Train teacher ensemble ($TEACHER_SEEDS) ==="
TEACHER_LIST=""
PRIMARY_TEACHER=""
for seed in $TEACHER_SEEDS; do
  tdir="model-${CANDIDATE_PREFIX}-t${seed}"
  restore_if_present "$tdir"
  if [ -f "$tdir/privacy-attestation.json" ] && node verify_attestation.mjs "$tdir/privacy-attestation.json" >/dev/null 2>&1; then
    echo "Reusing verified teacher $tdir"
  else
    echo "Training teacher $tdir (seed=$seed)..."
    MASKERA_SEED="$seed" $PY train.py "$tdir"
    rm -rf -- "$tdir"/checkpoint-*
    sync_out "$tdir"
  fi
  if [ -z "$PRIMARY_TEACHER" ]; then
    PRIMARY_TEACHER="$tdir"
    TEACHER_LIST="$tdir"
  else
    TEACHER_LIST="$TEACHER_LIST,$tdir"
  fi
done

TEACHER_TRIMMED="${PRIMARY_TEACHER}-trimmed"
restore_if_present "$TEACHER_TRIMMED"
if [ ! -f "$TEACHER_TRIMMED/vocab.txt" ]; then
  echo "=== [3/5] Trim primary teacher vocab to 20000 ==="
  $PY trim_vocab.py "$PRIMARY_TEACHER" "$TEACHER_TRIMMED" 20000
  sync_out "$TEACHER_TRIMMED"
fi
TRIM_VOCAB="$TEACHER_TRIMMED/vocab.txt" node gen_rare_surname_eval.mjs --check

export MASKERA_TEACHERS="$TEACHER_LIST"
export MASKERA_SUBWORD_DROPOUT=1.0
export MASKERA_DROPOUT_VOCAB="$TEACHER_TRIMMED"

CANDIDATES=""
if [ -d "student-v19-privacy-precision2-onnx" ]; then
  CANDIDATES="student-v19-privacy-precision2-onnx"
fi

echo "=== [4/5] Distill and export v20 sweep candidates ==="
for seed in $STUDENT_SEEDS; do
  sdir="student-${CANDIDATE_PREFIX}-s${seed}"
  odir="${sdir}-onnx"
  restore_if_present "$odir"
  if [ ! -f "$odir/onnx/model_q4.onnx" ]; then
    if [ ! -f "$sdir/privacy-attestation.json" ]; then
      echo "--- Distilling 43 MB student $sdir (seed=$seed) ---"
      MASKERA_SEED="$seed" MASKERA_HIDDEN_WEIGHT=0 $PY distill.py 6 "$sdir" "$PRIMARY_TEACHER"
      rm -rf -- "$sdir"/checkpoint-*
    else
      echo "--- Reusing already-distilled $sdir ---"
    fi
    $PY trim_vocab.py "$sdir" "${sdir}-trimmed" 20000
    rm -rf -- "$odir"
    $PY export_onnx.py "${sdir}-trimmed" "$odir"
    $PY quantize_combo.py "$odir"
    sync_out "$odir"
  fi
  CANDIDATES="$CANDIDATES $odir"
done

if [ "$RUN_HIDDEN_DISTILL" = "1" ]; then
  sdir="student-${CANDIDATE_PREFIX}-hid"
  odir="${sdir}-onnx"
  restore_if_present "$odir"
  if [ ! -f "$odir/onnx/model_q4.onnx" ]; then
    echo "--- Distilling 43 MB student with hidden-state loss $sdir ---"
    MASKERA_SEED=1337 MASKERA_HIDDEN_WEIGHT=0.25 $PY distill.py 6 "$sdir" "$PRIMARY_TEACHER"
    rm -rf -- "$sdir"/checkpoint-*
    $PY trim_vocab.py "$sdir" "${sdir}-trimmed" 20000
    rm -rf -- "$odir"
    $PY export_onnx.py "${sdir}-trimmed" "$odir"
    $PY quantize_combo.py "$odir"
    sync_out "$odir"
  fi
  CANDIDATES="$CANDIDATES $odir"
fi

# Low-rank sweep initialized from the first distilled v20 student
FIRST_SEED=$(echo "$STUDENT_SEEDS" | awk '{print $1}')
BASE_STUDENT="student-${CANDIDATE_PREFIX}-s${FIRST_SEED}"
if [ -d "$BASE_STUDENT" ]; then
  for rank in $LOWRANK_RANKS; do
    sdir="student-${CANDIDATE_PREFIX}-lr${rank}"
    odir="${sdir}-onnx"
    restore_if_present "$odir"
    if [ ! -f "$odir/onnx/model_q4.onnx" ]; then
      echo "--- Distilling low-rank student $sdir (rank=$rank) ---"
      MASKERA_INIT_STUDENT="$BASE_STUDENT" MASKERA_EMBED_RANK="$rank" \
        MASKERA_DISTILL_EPOCHS=2 MASKERA_SEED=1337 MASKERA_HIDDEN_WEIGHT=0.15 \
        $PY distill.py 6 "$sdir" "$PRIMARY_TEACHER"
      rm -rf -- "$sdir"/checkpoint-*
      $PY trim_vocab.py "$sdir" "${sdir}-trimmed" 20000
      rm -rf -- "${sdir}-fullonnx" "$odir"
      $PY export_onnx.py "${sdir}-trimmed" "${sdir}-fullonnx"
      $PY factorize_embeddings.py "${sdir}-fullonnx" "$odir" "$rank"
      sync_out "$odir"
    fi
    CANDIDATES="$CANDIDATES $odir"
  done
fi

echo "=== [5/5] Build JS runtime and grade every candidate ==="
cd "$ROOT"
pnpm --filter @maskera/core build
pnpm --filter maskera build

REPORT_OUT="$SCRIPT_DIR/.tmp/v20-sweep-report.json"
# shellcheck disable=SC2086
node training/grade_candidate.mjs --out "$REPORT_OUT" $CANDIDATES
if [ -n "$DRIVE_OUT" ]; then
  cp "$REPORT_OUT" "$DRIVE_OUT/v20-sweep-report.json"
fi
echo "[done] v20 sweep complete. Report saved to $REPORT_OUT"
