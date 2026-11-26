#!/bin/sh
# Size round: low-rank word embeddings on top of the shipped v19 student.
# Continues distillation from student-v19-privacy-precision2 with a vocab x r
# embedding lookup plus an r -> 768 projection, then trims, exports, splits the
# table exactly in the ONNX graph (factorize_embeddings.py) and grades the q4
# with the same aggregate-only corpora as run_v14.sh. No gate is enforced here:
# the log reports numbers next to the shipped baseline for comparison.
#
#   sh run_lowrank.sh <rank> [epochs=2] [lr=3e-5]
#
# Output: student-v19-lr<rank>-onnx/ and run_lr<rank>.log (both gitignored).
set -e

RANK=${1:?usage: run_lowrank.sh <rank> [epochs] [lr]}
EPOCHS=${2:-2}
LR=${3:-3e-5}

cd "$(dirname "$0")"
TRAINING=$(pwd)
ROOT=$(cd .. && pwd)
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
TEACHER=model-v19-privacy-precision2
INIT=student-v19-privacy-precision2
STUDENT=student-v19-lr$RANK
LOG=$TRAINING/run_lr$RANK.log

gates() {
  model=$1
  echo "### $model: $(wc -c <"$TRAINING/$model/onnx/model_q4.onnx" | tr -d ' ') bytes q4"
  (cd "$ROOT/apps/demo" && env MASKERA_MODEL="$model" MASKERA_MODEL_PATH="$TRAINING" \
    node scripts/evaluate-candidate-gates.mjs 2>&1 | grep -E "RESULT|GATE") || true
  (cd "$ROOT" && env MASKERA_MODEL="$model" MASKERA_AGGREGATE_ONLY=1 MASKERA_MODEL_PATH="$TRAINING" \
    node packages/ner/eval/benchmark-rare-surnames.mjs 2>&1 | grep RESULT | sed 's/^/rare-surnames /') || true
  for corpus in "" ./corpus-adr.mjs ./corpus-linkedin.mjs; do
    (cd "$ROOT" && env MASKERA_MODEL="$model" MASKERA_AGGREGATE_ONLY=1 ${corpus:+CORPUS_FILE=$corpus} \
      MASKERA_MODEL_PATH="$TRAINING" MASKERA_F1_FLOOR=0 node packages/ner/eval/run-eval.mjs 2>&1 |
      awk -v c="${corpus:-curated}" '/span-level/{s=1} s&&/F1:/{print c, "span", $0; s=0} /leaks \(missed\)/{print c, $0}') || true
  done
}

{
  echo "== rank $RANK, $EPOCHS epochs, lr $LR -> $STUDENT =="
  MASKERA_INIT_STUDENT=$INIT MASKERA_EMBED_RANK=$RANK \
  MASKERA_DISTILL_EPOCHS=$EPOCHS MASKERA_DISTILL_LR=$LR \
  MASKERA_SUBWORD_DROPOUT=1.0 MASKERA_DROPOUT_VOCAB=$TEACHER-trimmed \
    $PY distill.py 6 "$STUDENT" "$TEACHER" 2>&1 | grep -E "^\{|== "
  rm -rf -- "$STUDENT"/checkpoint-*
  $PY trim_vocab.py "$STUDENT" "$STUDENT-trimmed" 20000 2>&1 | grep "=="
  rm -rf -- "$STUDENT-fullonnx"
  $PY export_onnx.py "$STUDENT-trimmed" "$STUDENT-fullonnx" 2>&1 | grep -E "==|MB"
  $PY factorize_embeddings.py "$STUDENT-fullonnx" "$STUDENT-onnx" "$RANK" 2>&1 | grep -E "==|MB"
  gates "$INIT-onnx"
  gates "$STUDENT-onnx"
  echo "[done] rank $RANK graded; nothing was published."
} >"$LOG" 2>&1
cat "$LOG"
