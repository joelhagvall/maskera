#!/bin/sh
# Privacy-clean release runner. The historical filename is retained for
# compatibility, but no public/raw record corpus is read by this recipe.
# Task training, distillation and vocabulary selection use only exact,
# attested deterministic synthetic splits. Release gates retain aggregate
# metrics only and operate on synthetic or non-record category probes.
set -e

run_logged() {
  log=$1
  shift
  if "$@" >"$log" 2>&1; then
    cat "$log"
  else
    status=$?
    cat "$log"
    return "$status"
  fi
}

cd /Users/joelhagvall/Documents/GitHub/maskera/training
export PYTORCH_ENABLE_MPS_FALLBACK=1 TOKENIZERS_PARALLELISM=false
PY=.venv/bin/python
CANDIDATE=${CANDIDATE:-v14}
TEACHER=model-$CANDIDATE
TEACHER_TRIMMED=$TEACHER-trimmed
SOURCE_TEACHER=${SOURCE_TEACHER:-$TEACHER}
SOURCE_TEACHER_TRIMMED=${SOURCE_TEACHER_TRIMMED:-$TEACHER_TRIMMED}
STUDENT=student-$CANDIDATE
STUDENT_TRIMMED=$STUDENT-trimmed
MODEL=$STUDENT-onnx
RUN_PREFIX=run_$CANDIDATE
export CANDIDATE MASKERA_MODEL=$MODEL RUN_PREFIX

if [ "${SKIP_TEACHER:-0}" = "1" ]; then
  echo "[0-2/10] reuse attested teacher $SOURCE_TEACHER + tokenizer $SOURCE_TEACHER_TRIMMED..."
  test -d "$SOURCE_TEACHER"
  test -d "$SOURCE_TEACHER_TRIMMED"
  test -f "$SOURCE_TEACHER/privacy-attestation.json"
  test -f "$SOURCE_TEACHER_TRIMMED/privacy-attestation.json"
  node verify_attestation.mjs "$SOURCE_TEACHER/privacy-attestation.json"
  node verify_attestation.mjs "$SOURCE_TEACHER_TRIMMED/privacy-attestation.json"
  node audit_data.mjs
  node privacy_attestation.mjs
else
  echo "[0/10] build privacy-clean synthetic-only task data..."
  SYNTHETIC_TRAIN_ROWS=${SYNTHETIC_TRAIN_ROWS:-60000}
  SYNTHETIC_VAL_ROWS=${SYNTHETIC_VAL_ROWS:-4000}
  BALANCED_REPLAY_TRAIN_ROWS=${BALANCED_REPLAY_TRAIN_ROWS:-1200}
  BALANCED_REPLAY_VAL_ROWS=${BALANCED_REPLAY_VAL_ROWS:-200}
  HARD_NEGATIVE_TRAIN_ROWS=${HARD_NEGATIVE_TRAIN_ROWS:-2800}
  HARD_NEGATIVE_VAL_ROWS=${HARD_NEGATIVE_VAL_ROWS:-560}
  export BALANCED_REPLAY_TRAIN_ROWS BALANCED_REPLAY_VAL_ROWS
  export HARD_NEGATIVE_TRAIN_ROWS HARD_NEGATIVE_VAL_ROWS
  node generate_data.mjs "$SYNTHETIC_TRAIN_ROWS" "$SYNTHETIC_VAL_ROWS"
  node audit_data.mjs
  node privacy_attestation.mjs
  echo "[1/10] train teacher $TEACHER (aggregate log: $RUN_PREFIX-teacher.log)..."
  $PY train.py "$TEACHER" >"$RUN_PREFIX-teacher.log" 2>&1
  echo "[2/10] trim teacher vocab to 20000 (aggregate log: $RUN_PREFIX-trimtok.log)..."
  $PY trim_vocab.py "$TEACHER" "$TEACHER_TRIMMED" 20000 >"$RUN_PREFIX-trimtok.log" 2>&1
fi

# The rare-surname probe measures decomposed-name generalisation only. Its
# surfaces must be absent from training and decomposable by this tokenizer.
TRIM_VOCAB="$SOURCE_TEACHER_TRIMMED/vocab.txt" node gen_rare_surname_eval.mjs --check

if [ "${SKIP_DISTILL:-0}" = "1" ]; then
  echo "[3/10] reuse distilled student $STUDENT..."
  test -d "$STUDENT"
else
  echo "[3/10] distill $STUDENT (aggregate log: $RUN_PREFIX-distill.log)..."
  MASKERA_SUBWORD_DROPOUT=1.0 MASKERA_DROPOUT_VOCAB="$SOURCE_TEACHER_TRIMMED" \
    $PY distill.py 6 "$STUDENT" "$SOURCE_TEACHER" >"$RUN_PREFIX-distill.log" 2>&1
fi

echo "[4/10] trim student vocab to 20000..."
$PY trim_vocab.py "$STUDENT" "$STUDENT_TRIMMED" 20000
echo "[5/10] export ONNX..."
rm -rf -- "$MODEL"
$PY export_onnx.py "$STUDENT_TRIMMED" "$MODEL"
echo "[6/10] quantize q4 combo..."
$PY quantize_combo.py "$MODEL"

# Eval imports the built workspace package. Rebuild here so a runtime precision
# fix (for example a reviewed whole-word denylist addition) cannot be missed by
# stale dist files while the weights themselves are graded correctly.
echo "[6b/10] build current NER runtime for candidate gates..."
cd /Users/joelhagvall/Documents/GitHub/maskera
pnpm --filter maskera build

GATE_FAILURES=0
echo "[7/10] G2 aggregate-only synthetic gold gate (q4)..."
cd /Users/joelhagvall/Documents/GitHub/maskera/apps/demo
run_logged "../../training/$RUN_PREFIX-goldgates.log" \
  env MASKERA_MODEL_PATH="$(pwd)/../../training" node scripts/evaluate-candidate-gates.mjs \
  || GATE_FAILURES=1

echo "[8/10] G1 rotated rare-surname gate..."
cd /Users/joelhagvall/Documents/GitHub/maskera
run_logged "training/$RUN_PREFIX-raresurnames-$CANDIDATE.log" \
  env MASKERA_AGGREGATE_ONLY=1 MASKERA_MODEL_PATH="$PWD/training" \
  node packages/ner/eval/benchmark-rare-surnames.mjs
run_logged "training/$RUN_PREFIX-raresurnames-$CANDIDATE-legacy.log" \
  env MASKERA_AGGREGATE_ONLY=1 BENCHMARK_FILE=training/eval/rare-surnames-legacy.txt \
  MASKERA_MODEL_PATH="$PWD/training" node packages/ner/eval/benchmark-rare-surnames.mjs
node -e '
const fs = require("node:fs")
const parse = (path) => {
  const match = fs.readFileSync(path, "utf8").match(/RESULT masked_recall=([\d.]+) per_recall=([\d.]+) leaks=(\d+)\/(\d+)/)
  if (!match) { console.error("aggregate RESULT missing in " + path); process.exit(1) }
  return { masked: +match[1], per: +match[2], leaks: +match[3] }
}
const candidate = parse(`training/${process.env.RUN_PREFIX}-raresurnames-${process.env.CANDIDATE}.log`)
const historicalV13 = { masked: 0.949, per: 0.6871, leaks: 15 }
console.log(`rare-surname aggregates: candidate masked=${candidate.masked}, typed=${candidate.per}, leaks=${candidate.leaks}; historical floor=${historicalV13.masked}`)
if (candidate.masked > historicalV13.masked) console.log("GATE PASS (G1): masked recall beats the historical aggregate floor")
else { console.error("GATE FAIL (G1): masked recall does not beat the historical aggregate floor"); process.exit(1) }
' || GATE_FAILURES=1

echo "[9/10] G3 provenance, privacy and source-backed fixture gates..."
node training/verify_attestation.mjs "training/$MODEL/privacy-attestation.json" || GATE_FAILURES=1
node training/audit_data.mjs training/data/train.jsonl training/data/val.jsonl || GATE_FAILURES=1
node scripts/check-fixture-identifiers.mjs || GATE_FAILURES=1

echo "[10/10] G5/G4 strict synthetic curated, ADR and LinkedIn-style gates..."
run_logged "training/$RUN_PREFIX-strict-curated.log" \
  env MASKERA_AGGREGATE_ONLY=1 MASKERA_MODEL_PATH="$PWD/training" MASKERA_F1_FLOOR=0.90 \
  node packages/ner/eval/run-eval.mjs || GATE_FAILURES=1
run_logged "training/$RUN_PREFIX-strict-adr.log" \
  env MASKERA_AGGREGATE_ONLY=1 CORPUS_FILE=./corpus-adr.mjs MASKERA_MODEL_PATH="$PWD/training" \
  node packages/ner/eval/run-eval.mjs || GATE_FAILURES=1
run_logged "training/$RUN_PREFIX-strict-linkedin.log" \
  env MASKERA_AGGREGATE_ONLY=1 CORPUS_FILE=./corpus-linkedin.mjs MASKERA_MODEL_PATH="$PWD/training" \
  node packages/ner/eval/run-eval.mjs || GATE_FAILURES=1
node -e '
const fs = require("node:fs")
const path = `training/${process.env.RUN_PREFIX}-strict-adr.log`
const text = fs.readFileSync(path, "utf8")
const f1 = text.match(/--- span-level \(label-agnostic\) ---[\s\S]*?F1:\s+([\d.]+)%/)
const leaks = text.match(/leaks \(missed\):\s+(\d+)/)
if (!f1 || !leaks) { console.error("GATE FAIL (G4): aggregate ADR result missing"); process.exit(1) }
if (+f1[1] === 100 && +leaks[1] === 0) console.log("GATE PASS (G4): synthetic ADR corpus clean sweep")
else { console.error(`GATE FAIL (G4): synthetic ADR F1 ${f1[1]}%, leaks ${leaks[1]}`); process.exit(1) }
' || GATE_FAILURES=1

if [ "$GATE_FAILURES" -ne 0 ]; then
  echo "[failed gate] $CANDIDATE completed the privacy-clean battery but is not a release candidate."
  exit 1
fi
echo "[done] $CANDIDATE privacy-clean candidate complete; no publication was performed."
