#!/bin/sh
# Reusable privacy-clean Maskera GPU sweep runner.
#
# Usage:
#   sh training/run_gpu_sweep.sh [--preset training/presets/v22f.env]
#
# All knobs can be set via a preset .env file or environment variables:
#   CANDIDATE_PREFIX   (default: v22f)
#   TEACHER_SEEDS      (default: "1337 2024 42")
#   STUDENT_SEEDS      (default: "42 777 2024")
#   STUDENT_LAYERS     (default: 8)
#   EMBED_RANK         (default: 256; 0 disables factorization and uses quantize_combo.py)
#   VOCAB_SIZE         (default: 24000)
#   LLM_PROSE_FILE     (default: data/llm_prose_pool_v22f.json)
#   MASKERA_CLASS_WEIGHTS, LC_AUG, UC_AUG, MASKERA_DISTILL_EPOCHS, etc.
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

PRESET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --preset)
      PRESET="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,17p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [ -n "$PRESET" ]; then
  case "$PRESET" in
    /*) PRESET_PATH="$PRESET" ;;
    *) PRESET_PATH="$ROOT/$PRESET" ;;
  esac
  if [ ! -f "$PRESET_PATH" ]; then
    echo "ERROR: Preset not found: $PRESET_PATH" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$PRESET_PATH"
  set +a
fi

cd "$SCRIPT_DIR"

export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
if [ -n "${PY:-}" ]; then
  :
elif [ -x ".venv/bin/python" ]; then
  PY=.venv/bin/python
else
  PY=python3
fi

CANDIDATE_PREFIX=${CANDIDATE_PREFIX:-v22f}
TEACHER_SEEDS=${TEACHER_SEEDS:-"1337 2024 42"}
STUDENT_SEEDS=${STUDENT_SEEDS:-"42 777 2024"}
STUDENT_LAYERS=${STUDENT_LAYERS:-8}
EMBED_RANK=${EMBED_RANK:-256}
VOCAB_SIZE=${VOCAB_SIZE:-24000}

export LC_AUG=${LC_AUG:-0.38}
export UC_AUG=${UC_AUG:-0.07}
export MASKERA_MAX_LEN=${MASKERA_MAX_LEN:-256}
export MASKERA_CLASS_WEIGHTS=${MASKERA_CLASS_WEIGHTS:-"1.02,1.16,1.16,1.38,1.38,0.44,0.44,1.08,1.08"}
export MASKERA_NATIVE_VOCAB_FLOOR=${MASKERA_NATIVE_VOCAB_FLOOR:-12000}
export LLM_SKIP_LOC_CONTRAST=${LLM_SKIP_LOC_CONTRAST:-1}

SYNTHETIC_TRAIN_ROWS=${SYNTHETIC_TRAIN_ROWS:-90000}
SYNTHETIC_VAL_ROWS=${SYNTHETIC_VAL_ROWS:-5000}
BARE_DECLARATIVE_TRAIN_ROWS=${BARE_DECLARATIVE_TRAIN_ROWS:-0}
BARE_DECLARATIVE_VAL_ROWS=${BARE_DECLARATIVE_VAL_ROWS:-0}
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
CASED_HOMOGRAPH_TRAIN_ROWS=${CASED_HOMOGRAPH_TRAIN_ROWS:-1200}
CASED_HOMOGRAPH_VAL_ROWS=${CASED_HOMOGRAPH_VAL_ROWS:-120}
CLEAN_PROSE_NEG_TRAIN_ROWS=${CLEAN_PROSE_NEG_TRAIN_ROWS:-8000}
CLEAN_PROSE_NEG_VAL_ROWS=${CLEAN_PROSE_NEG_VAL_ROWS:-800}
MIXED_PRECISION_TRAIN_ROWS=${MIXED_PRECISION_TRAIN_ROWS:-6000}
MIXED_PRECISION_VAL_ROWS=${MIXED_PRECISION_VAL_ROWS:-600}
PARAGRAPH_TRAIN_ROWS=${PARAGRAPH_TRAIN_ROWS:-4000}
PARAGRAPH_VAL_ROWS=${PARAGRAPH_VAL_ROWS:-300}
STRUCTURED_FORM_TRAIN_ROWS=${STRUCTURED_FORM_TRAIN_ROWS:-9000}
STRUCTURED_FORM_VAL_ROWS=${STRUCTURED_FORM_VAL_ROWS:-700}

export LLM_PROSE_FILE=${LLM_PROSE_FILE:-"data/llm_prose_pool_v22f.json"}
export LLM_CLEAN_TRAIN_ROWS=${LLM_CLEAN_TRAIN_ROWS:-16000}
export LLM_CLEAN_VAL_ROWS=${LLM_CLEAN_VAL_ROWS:-1200}
export LLM_SLOTTED_TRAIN_ROWS=${LLM_SLOTTED_TRAIN_ROWS:-24000}
export LLM_SLOTTED_VAL_ROWS=${LLM_SLOTTED_VAL_ROWS:-1800}
export LLM_CONTRAST_TRAIN_ROWS=${LLM_CONTRAST_TRAIN_ROWS:-4000}
export LLM_CONTRAST_VAL_ROWS=${LLM_CONTRAST_VAL_ROWS:-320}

export BARE_DECLARATIVE_TRAIN_ROWS BARE_DECLARATIVE_VAL_ROWS
export BALANCED_REPLAY_TRAIN_ROWS BALANCED_REPLAY_VAL_ROWS
export HARD_NEGATIVE_TRAIN_ROWS HARD_NEGATIVE_VAL_ROWS
export CLINICAL_CONTRAST_TRAIN_ROWS CLINICAL_CONTRAST_VAL_ROWS
export HOMOGRAPH_CONTRAST_TRAIN_ROWS HOMOGRAPH_CONTRAST_VAL_ROWS
export REGISTER_PRECISION_TRAIN_ROWS REGISTER_PRECISION_VAL_ROWS
export CASED_HOMOGRAPH_TRAIN_ROWS CASED_HOMOGRAPH_VAL_ROWS
export CLEAN_PROSE_NEG_TRAIN_ROWS CLEAN_PROSE_NEG_VAL_ROWS
export MIXED_PRECISION_TRAIN_ROWS MIXED_PRECISION_VAL_ROWS
export PARAGRAPH_TRAIN_ROWS PARAGRAPH_VAL_ROWS
export STRUCTURED_FORM_TRAIN_ROWS STRUCTURED_FORM_VAL_ROWS

export MASKERA_PRECISION=${MASKERA_PRECISION:-auto}
export MASKERA_TRAIN_BATCH=${MASKERA_TRAIN_BATCH:-32}
export MASKERA_TRAIN_EPOCHS=${MASKERA_TRAIN_EPOCHS:-2}
export MASKERA_TRAIN_LR=${MASKERA_TRAIN_LR:-2.5e-5}
export MASKERA_LABEL_SMOOTHING=${MASKERA_LABEL_SMOOTHING:-0.0}
export MASKERA_WARMUP_RATIO=${MASKERA_WARMUP_RATIO:-0.06}
export MASKERA_LR_SCHEDULER=${MASKERA_LR_SCHEDULER:-cosine}
export MASKERA_DISTILL_BATCH=${MASKERA_DISTILL_BATCH:-32}
export MASKERA_DISTILL_EPOCHS=${MASKERA_DISTILL_EPOCHS:-4}
export MASKERA_DISTILL_LR=${MASKERA_DISTILL_LR:-3e-5}
export MASKERA_ALPHA=${MASKERA_ALPHA:-0.5}
export MASKERA_TEMP=${MASKERA_TEMP:-2.0}
export MASKERA_NUM_WORKERS=${MASKERA_NUM_WORKERS:-4}

mkdir -p data .tmp

TOTAL_LLM=$((LLM_CLEAN_TRAIN_ROWS + LLM_CLEAN_VAL_ROWS + LLM_SLOTTED_TRAIN_ROWS + LLM_SLOTTED_VAL_ROWS + LLM_CONTRAST_TRAIN_ROWS + LLM_CONTRAST_VAL_ROWS))
if [ "$TOTAL_LLM" -gt 0 ] && [ ! -f "$LLM_PROSE_FILE" ]; then
  echo "ERROR: Missing LLM_PROSE_FILE: $LLM_PROSE_FILE" >&2
  exit 1
fi

echo "=== [1/5] Generate and audit ${CANDIDATE_PREFIX} privacy-clean synthetic data ==="
node generate_data.mjs "$SYNTHETIC_TRAIN_ROWS" "$SYNTHETIC_VAL_ROWS"
node audit_data.mjs
node privacy_attestation.mjs
node verify_attestation.mjs data/privacy-attestation.json
node --test privacy_guard.test.mjs privacy_attestation.test.mjs

echo "=== [2/5] Train teacher ensemble ($TEACHER_SEEDS) ==="
TEACHER_LIST=""
PRIMARY_TEACHER=""
for seed in $TEACHER_SEEDS; do
  tdir="model-${CANDIDATE_PREFIX}-t${seed}"
  if [ -f "$tdir/privacy-attestation.json" ] && node verify_attestation.mjs "$tdir/privacy-attestation.json" >/dev/null 2>&1; then
    echo "Reusing verified teacher $tdir"
  else
    echo "Training teacher $tdir (seed=$seed)..."
    MASKERA_SEED="$seed" $PY train.py "$tdir"
    rm -rf -- "$tdir"/checkpoint-*
  fi
  if [ -z "$PRIMARY_TEACHER" ]; then
    PRIMARY_TEACHER="$tdir"
    TEACHER_LIST="$tdir"
  else
    TEACHER_LIST="$TEACHER_LIST,$tdir"
  fi
done

TEACHER_TRIMMED="${PRIMARY_TEACHER}-trimmed"
if [ ! -f "$TEACHER_TRIMMED/vocab.txt" ]; then
  echo "=== [3/5] Trim primary teacher vocab to $VOCAB_SIZE (native core floor $MASKERA_NATIVE_VOCAB_FLOOR) ==="
  $PY trim_vocab.py "$PRIMARY_TEACHER" "$TEACHER_TRIMMED" "$VOCAB_SIZE"
fi
TRIM_VOCAB="$TEACHER_TRIMMED/vocab.txt" node gen_rare_surname_eval.mjs --check

export MASKERA_TEACHERS="$TEACHER_LIST"
export MASKERA_SUBWORD_DROPOUT=1.0
export MASKERA_DROPOUT_VOCAB="$TEACHER_TRIMMED"

CANDIDATES=""
if [ -d "student-v21-shipped-onnx" ]; then
  CANDIDATES="student-v21-shipped-onnx"
fi

echo "=== [4/5] Distill and export ${STUDENT_LAYERS}L rank-${EMBED_RANK} ${VOCAB_SIZE}-vocab ${CANDIDATE_PREFIX} students ($STUDENT_SEEDS) ==="
for seed in $STUDENT_SEEDS; do
  sdir="student-${CANDIDATE_PREFIX}-s${seed}"
  raw_odir="${sdir}-raw-onnx"
  odir="${sdir}-onnx"
  if [ ! -f "$odir/onnx/model_q4.onnx" ]; then
    if [ ! -f "$sdir/privacy-attestation.json" ]; then
      echo "--- Distilling ${STUDENT_LAYERS}L rank-${EMBED_RANK} student $sdir (seed=$seed) ---"
      MASKERA_SEED="$seed" MASKERA_EMBED_RANK="$EMBED_RANK" \
        MASKERA_HIDDEN_WEIGHT="${MASKERA_HIDDEN_WEIGHT:-0.25}" \
        MASKERA_PER_CONSISTENCY_WEIGHT="${MASKERA_PER_CONSISTENCY_WEIGHT:-1.0}" \
        $PY distill.py "$STUDENT_LAYERS" "$sdir" "$PRIMARY_TEACHER"
      rm -rf -- "$sdir"/checkpoint-*
    fi
    $PY trim_vocab.py "$sdir" "${sdir}-trimmed" "$VOCAB_SIZE"
    rm -rf -- "$raw_odir" "$odir"
    if [ "$EMBED_RANK" -gt 0 ]; then
      $PY export_onnx.py "${sdir}-trimmed" "$raw_odir"
      $PY factorize_embeddings.py "$raw_odir" "$odir" "$EMBED_RANK"
      rm -rf -- "$raw_odir"
    else
      $PY export_onnx.py "${sdir}-trimmed" "$odir"
      $PY quantize_combo.py "$odir"
    fi
    rm -rf -- "${sdir}-trimmed"
  fi
  CANDIDATES="$CANDIDATES $odir"
done

echo "=== [5/5] Build JS runtime and grade baseline vs ${CANDIDATE_PREFIX} candidates ==="
cd "$ROOT"
pnpm --filter @maskera/core build
pnpm --filter maskera build

REPORT_OUT="$SCRIPT_DIR/.tmp/${CANDIDATE_PREFIX}-sweep-report.json"
# shellcheck disable=SC2086
node training/grade_candidate.mjs --out "$REPORT_OUT" $CANDIDATES
echo "[done] ${CANDIDATE_PREFIX} sweep complete. Report saved to $REPORT_OUT"
