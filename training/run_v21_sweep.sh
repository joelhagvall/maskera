#!/bin/sh
# Privacy-clean Maskera v21 GPU sweep runner (Colab A100/L4).
#
# Builds directly on the winning v20b recipe and adds two targeted contrast families:
#   1. CASED_HOMOGRAPH_TRAIN_ROWS=2400 (sentence-initial capitalised homographs, 1:1 person vs word)
#   2. CLEAN_PROSE_NEG_TRAIN_ROWS=4000 (0-entity Swedish prose: generic institutions, tech, finance, editorial)
#
# Trains a 3-seed KB-BERT teacher ensemble, trims to 20k vocab, distills 2 43 MB students
# (seeds 777 and 1337), and grades both against shipped v20 across all release gates.
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

CANDIDATE_PREFIX=${CANDIDATE_PREFIX:-v21j}
TEACHER_SEEDS=${TEACHER_SEEDS:-"1337 2024 42"}
STUDENT_SEEDS=${STUDENT_SEEDS:-"777 2024 42"}

# v21j: Final release polish on top of v21i's breakthrough (94.3% Namn, 97.1% Platser beating Presidio):
#   - Removes "stationen" from hardGenericLoc + adds -stationen civic landmarks in DISTRICTS
#     (guarantees 0 ADR leaks / Centralstationen PASS)
#   - Adds sentence-initial ORG authority contrast alongside long compound O nouns (0 curated leaks)
#   - ORG class weight 0.48 (down from 0.65): targets <= 8-9% over-masking while preserving
#     ~94% Namn, ~92% Gemener, ~97% Platser, ~95.2% Adresser
export LC_AUG=${LC_AUG:-0.33}
export MASKERA_MAX_LEN=${MASKERA_MAX_LEN:-256}
export MASKERA_CLASS_WEIGHTS=${MASKERA_CLASS_WEIGHTS:-"1.0,1.20,1.20,1.20,1.20,0.48,0.48,1.20,1.20"}
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
CASED_HOMOGRAPH_TRAIN_ROWS=${CASED_HOMOGRAPH_TRAIN_ROWS:-800}
CASED_HOMOGRAPH_VAL_ROWS=${CASED_HOMOGRAPH_VAL_ROWS:-80}
CLEAN_PROSE_NEG_TRAIN_ROWS=${CLEAN_PROSE_NEG_TRAIN_ROWS:-0}
CLEAN_PROSE_NEG_VAL_ROWS=${CLEAN_PROSE_NEG_VAL_ROWS:-0}
MIXED_PRECISION_TRAIN_ROWS=${MIXED_PRECISION_TRAIN_ROWS:-6000}
MIXED_PRECISION_VAL_ROWS=${MIXED_PRECISION_VAL_ROWS:-600}
PARAGRAPH_TRAIN_ROWS=${PARAGRAPH_TRAIN_ROWS:-6000}
PARAGRAPH_VAL_ROWS=${PARAGRAPH_VAL_ROWS:-400}

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

export MASKERA_PRECISION=${MASKERA_PRECISION:-auto}
export MASKERA_TRAIN_BATCH=${MASKERA_TRAIN_BATCH:-32}
export MASKERA_TRAIN_EPOCHS=${MASKERA_TRAIN_EPOCHS:-2}
export MASKERA_TRAIN_LR=${MASKERA_TRAIN_LR:-2.5e-5}
export MASKERA_LABEL_SMOOTHING=${MASKERA_LABEL_SMOOTHING:-0.0}
export MASKERA_WARMUP_RATIO=${MASKERA_WARMUP_RATIO:-0.06}
export MASKERA_LR_SCHEDULER=${MASKERA_LR_SCHEDULER:-cosine}
export MASKERA_DISTILL_BATCH=${MASKERA_DISTILL_BATCH:-32}
export MASKERA_DISTILL_EPOCHS=${MASKERA_DISTILL_EPOCHS:-3}
export MASKERA_DISTILL_LR=${MASKERA_DISTILL_LR:-3e-5}
export MASKERA_ALPHA=${MASKERA_ALPHA:-0.5}
export MASKERA_TEMP=${MASKERA_TEMP:-2.0}
export MASKERA_NUM_WORKERS=${MASKERA_NUM_WORKERS:-2}

echo "=== [1/5] Generate and audit v21 privacy-clean synthetic data ==="
mkdir -p data .tmp
node generate_data.mjs "$SYNTHETIC_TRAIN_ROWS" "$SYNTHETIC_VAL_ROWS"
node audit_data.mjs
node privacy_attestation.mjs
node verify_attestation.mjs data/privacy-attestation.json
node --test privacy_guard.test.mjs privacy_attestation.test.mjs

echo "=== [2/5] Train 3-seed teacher ensemble ($TEACHER_SEEDS) ==="
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
  echo "=== [3/5] Trim primary teacher vocab to 20000 ==="
  $PY trim_vocab.py "$PRIMARY_TEACHER" "$TEACHER_TRIMMED" 20000
fi
TRIM_VOCAB="$TEACHER_TRIMMED/vocab.txt" node gen_rare_surname_eval.mjs --check

export MASKERA_TEACHERS="$TEACHER_LIST"
export MASKERA_SUBWORD_DROPOUT=1.0
export MASKERA_DROPOUT_VOCAB="$TEACHER_TRIMMED"

CANDIDATES=""
if [ -d "student-v20-shipped-onnx" ]; then
  CANDIDATES="student-v20-shipped-onnx"
fi

echo "=== [4/5] Distill and export 43 MB v21 students ($STUDENT_SEEDS) ==="
for seed in $STUDENT_SEEDS; do
  sdir="student-${CANDIDATE_PREFIX}-s${seed}"
  odir="${sdir}-onnx"
  if [ ! -f "$odir/onnx/model_q4.onnx" ]; then
    if [ ! -f "$sdir/privacy-attestation.json" ]; then
      echo "--- Distilling 43 MB student $sdir (seed=$seed) ---"
      MASKERA_SEED="$seed" MASKERA_HIDDEN_WEIGHT="${MASKERA_HIDDEN_WEIGHT:-0.25}" MASKERA_PER_CONSISTENCY_WEIGHT="${MASKERA_PER_CONSISTENCY_WEIGHT:-1.0}" $PY distill.py 6 "$sdir" "$PRIMARY_TEACHER"
      rm -rf -- "$sdir"/checkpoint-*
    fi
    $PY trim_vocab.py "$sdir" "${sdir}-trimmed" 20000
    rm -rf -- "$odir"
    $PY export_onnx.py "${sdir}-trimmed" "$odir"
    $PY quantize_combo.py "$odir"
  fi
  CANDIDATES="$CANDIDATES $odir"
done

echo "=== [5/5] Build JS runtime and grade shipped v20 vs v21 candidates ==="
cd "$ROOT"
pnpm --filter @maskera/core build
pnpm --filter maskera build

REPORT_OUT="$SCRIPT_DIR/.tmp/v21-sweep-report.json"
# shellcheck disable=SC2086
node training/grade_candidate.mjs --out "$REPORT_OUT" $CANDIDATES
echo "[done] v21 sweep complete. Report saved to $REPORT_OUT"
