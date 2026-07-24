# Address v19 runbook

This is the exact procedure for the next address-focused model round. The goal
is not to make one known corpus green. The goal is to improve the shipped q4
pipeline, keep every existing privacy/precision gate, and then beat Azure AI
Language on an unseen Swedish address holdout.

## Non-negotiable measurement rules

- `bench/corpora/osm-addresses.json` is now a **development set**. Its error
  families have been inspected, so it is no longer an independent final test.
- Never copy its address strings, OSM ids, house numbers, or chat wrappers into
  training. Learn the category, not the answers. The current local snapshot is
  identified by corpus SHA-256
  `10d0aa25d1f1125f44ec852e82fcdf987ae635240e0b493b2007230d3cb8cc24`.
- The v18 training data has one accidental exact address collision with this
  development set. That makes the current comparison directional, not a clean
  independent claim. The v19 data build must scrub every exact development
  address and make `check_address_eval_leak.mjs` pass with zero exceptions.
- Do not change a candidate after seeing the final holdout. A failed final
  holdout starts a new model round and requires another unseen holdout.
- Compare shipped v18, the locked candidate, Azure PII, Azure NER, and the
  Azure PII+NER union on the exact same documents.
- Keep payloads out of logs beyond the public OSM addresses and synthetic
  wrappers already in this test. Azure credentials stay in environment
  variables and must be unset or scoped to a subshell.
- Do not publish new scores from this runbook. Release numbers belong in
  `docs/BENCHMARKS.md` and all snapshot carriers must be updated together.

Before cleaning ignored files or moving machines, preserve these two local
development artifacts together:

```bash
cd /Users/joelhagvall/Documents/GitHub/maskera
jq -r .corpusSha256 bench/corpora/osm-addresses.meta.json
shasum -a 256 \
  bench/corpora/osm-addresses.json \
  bench/corpora/osm-addresses.meta.json
```

## What the current error analysis says to fix

There are two levers. Use both, but measure them separately.

### 1. Safe reconstruction before another expensive training run

The model often finds enough of an address for deterministic reconstruction to
finish the mask. Extend `packages/ner/src/index.ts` only for strong address
shapes:

1. An attached single house-letter after a detected number, including letters
   beyond the current A-D range.
2. Numeric ranges after a detected first number: hyphen, en dash, or em dash
   followed by the second number and optional attached letter.
3. Detached house letters E-H. Do not blindly accept every detached letter:
   `i` after a house number is commonly the Swedish preposition in a following
   phrase.
4. Whitespace-separated entity fragments where the final fragment is a strong
   numbered street tail. Add at least `plats`, `centrum`, `stråk/stråket`,
   `kyrkogata`, and the existing street types. The union should become one
   ADDRESS span even when the prefix was typed PERSON, LOCATION, or
   ORGANIZATION.

For every positive reconstruction test, add a negative test that must not
widen across an ordinary following word, time, case number, amount, or
unrelated entity. Run:

```bash
pnpm exec vitest run packages/ner/test/reconstruct.test.ts
pnpm -C packages/ner build
node bench/run-maskera.mjs osm-addresses
node bench/grade.mjs osm-addresses
node bench/analyze-address-coverage.mjs osm-addresses
```

Keep this change only if material partial leaks fall without a precision or
retention regression. This is a pipeline improvement, not evidence that the
weights learned the pattern.

### 2. A confined address-robustness training dose

Add a new opt-in `ADDRESS_ROBUSTNESS_TRAIN_ROWS` family to
`training/generate_data.mjs`. Its default must be zero so the v18 recipe remains
reproducible. Do not enlarge the existing global address gazetteer blindly.
Add a generic exact-address scrub against the development corpus after all
converters have run; do not hard-code the one known collision. The scrub must
drop matching rows rather than relabel their ADR tokens as O, which would teach
the opposite of the desired behavior.

Build disjoint synthetic surfaces for these families:

1. Standard Swedish street suffixes with attached house letters sampled across
   A-Z, not mainly A-D.
2. House-number ranges using `-`, `–`, and `—`, optionally followed by a
   letter.
3. Detached E-H house letters.
4. Multiword/genitive streets ending in `gata`, `väg`, `plats`, or `torg`.
5. Free-word address endings such as `centrum`, `stråket`, `plan`, `kyrkogata`,
   and `esplanaden`.
6. Short or deceptively ordinary street stems combined with a number.

Within this dose, use roughly 40% original casing, 30% lowercase, and 30% ALL
CAPS. This targets the observed address weakness without raising global
`UC_AUG` for PERSON/LOCATION/ORGANIZATION. Include hard negative frames with
similar common words followed by times, amounts, route numbers, product
versions, and case numbers. Keep the existing balanced replay unchanged.

Run a dose sweep with one changed variable:

- `t1`: 300 new training rows
- `t2`: 600 new training rows
- `t3`: 1,200 new training rows

Use the same templates, seeds, v18 pseudo pool, and converters for every take.
Reject a take at the teacher screen if ADR improves by sacrificing the existing
PER/LOC/ORG probes or ordinary-word negatives. Distill only the best teacher.

## Exact candidate build

The commands below assume the new generator knob and its tests have been
implemented. Replace `t1` with the selected dose name and set its row count.

```bash
cd /Users/joelhagvall/Documents/GitHub/maskera/training

export CANDIDATE=v19-address-t1
export ADDRESS_ROBUSTNESS_TRAIN_ROWS=300
export PSEUDO_TOTAL=66000
export PSEUDO_EMPTY_SHARE=0.30
export BALANCED_REPLAY_TRAIN_ROWS=1200
export LC_AUG=0.35
export UC_AUG=0.05
export DATA_SEED=1337

node generate_data.mjs
node convert_klintan.mjs
node convert_sucx.mjs
node convert_sic2.mjs
node convert_massive.mjs
node convert_multiconer.mjs
node convert_pseudo.mjs
node audit_data.mjs
node gen_rare_surname_eval.mjs --check
node check_address_eval_leak.mjs ../bench/corpora/osm-addresses.json

MASKERA_SEED=2024 .venv/bin/python train.py "model-$CANDIDATE"
.venv/bin/python trim_vocab.py \
  "model-$CANDIDATE" "model-$CANDIDATE-trimmed" 20000
.venv/bin/python screen_balanced.py "model-$CANDIDATE"
```

Record the teacher validation report and `screen_balanced.py` summary for every
dose. After choosing one teacher, run the existing full q4 pipeline. The
teacher uses seed 2024; distillation deliberately returns to the shipped v18
seed 1337:

```bash
MASKERA_SEED=1337 \
CANDIDATE="$CANDIDATE" \
SKIP_TEACHER=1 \
SOURCE_TEACHER="model-$CANDIDATE" \
SOURCE_TEACHER_TRIMMED="model-$CANDIDATE-trimmed" \
./run_v14.sh
```

`run_v14.sh` must finish with all five gates passing. A completed training run
is not a release candidate when the script exits non-zero. Do not pipe the
script through `tee`: POSIX `sh` has no `pipefail`, so that can hide a failed
gate behind `tee`'s successful exit.

## Compare the local candidate without overwriting v18

The benchmark runner accepts a local model and a unique system name. Always
keep the shipped `osm-addresses.maskera.json` baseline intact:

```bash
cd /Users/joelhagvall/Documents/GitHub/maskera
pnpm -C packages/ner build

MASKERA_MODEL="student-$CANDIDATE-onnx" \
MASKERA_MODEL_PATH="$PWD/training" \
MASKERA_SYSTEM="maskera-$CANDIDATE" \
node bench/run-maskera.mjs osm-addresses

node bench/grade.mjs osm-addresses
node bench/analyze-address-coverage.mjs osm-addresses
```

The development-set candidate must improve exact span recall and material
coverage over shipped v18. It must not regress ADDRESS precision, the strict
ADR corpus, curated, rare-surname, klintan, LinkedIn, or retention gates. Do not
pick a candidate from aggregate F1 alone: a leaked house number is more
important than a cosmetic label split.

## Lock the candidate, then create the final holdout

Before generating or viewing the holdout:

1. Record the candidate q4 SHA-256 and git commit.
2. Commit or otherwise freeze all model and reconstruction code.
3. Generate one random selection salt and record it before fetching.
4. Do not train or tune again after this point.

```bash
cd /Users/joelhagvall/Documents/GitHub/maskera
shasum -a 256 "training/student-$CANDIDATE-onnx/onnx/model_q4.onnx"
git rev-parse HEAD
openssl rand -hex 16
```

Set the printed random value as `HOLDOUT_SALT`. Generate 1,000 unseen addresses
while explicitly excluding every development address. `OSM_REFRESH=1` avoids
silently depending on an old Overpass cache:

```bash
export HOLDOUT_SALT=<recorded-random-value>
OSM_CORPUS_NAME=osm-addresses-holdout \
OSM_ADDRESS_COUNT=1000 \
OSM_ADDRESS_SALT="$HOLDOUT_SALT" \
OSM_EXCLUDE_CORPUS=bench/corpora/osm-addresses.json \
OSM_REFRESH=1 \
node bench/fetch-osm-addresses.mjs

jq -r .corpusSha256 bench/corpora/osm-addresses-holdout.meta.json
node training/check_address_eval_leak.mjs \
  bench/corpora/osm-addresses-holdout.json \
  training/data/train.jsonl \
  training/data/val.jsonl
```

The leakage check happens before any model or Azure prediction. If it finds a
training collision, the holdout is invalid: record the failed corpus hash,
derive a deterministic retry salt by appending `-retry-1`, regenerate, and run
the leakage check again. This is leakage removal, not score-based resampling;
no predictions may be viewed first.

If 1,000 documents do not provide enough statistical power for the safety
comparison, the count may be raised to 2,000 **before viewing any predictions**
and only after checking the current Azure quota and price. Never enlarge or
replace the set because the first result was disappointing.

## Final same-corpus Maskera versus Azure run

Run shipped v18 first, then the locked candidate:

```bash
node bench/run-maskera.mjs osm-addresses-holdout

MASKERA_MODEL="student-$CANDIDATE-onnx" \
MASKERA_MODEL_PATH="$PWD/training" \
MASKERA_SYSTEM="maskera-$CANDIDATE" \
node bench/run-maskera.mjs osm-addresses-holdout
```

Run Azure in a subshell so the key disappears when the command finishes. The
resource names below match the existing benchmark resource; change them only
if that resource has been replaced:

```bash
(
  export AZURE_LANGUAGE_ENDPOINT="$(az cognitiveservices account show \
    --name maskera-language-benchmark-joel \
    --resource-group maskera-benchmark-rg \
    --query properties.endpoint -o tsv)"
  export AZURE_LANGUAGE_KEY="$(az cognitiveservices account keys list \
    --name maskera-language-benchmark-joel \
    --resource-group maskera-benchmark-rg \
    --query key1 -o tsv)"
  node bench/run-azure.mjs osm-addresses-holdout
)

node bench/grade.mjs osm-addresses-holdout
node bench/analyze-address-coverage.mjs osm-addresses-holdout
jq '.metadata' bench/out/osm-addresses-holdout.azure-pii-ner.json
```

Verify that Azure metadata records Swedish input, UTF-16 offsets,
`loggingOptOut: true`, one stable model version per feature, and zero warnings.

## Win and release decision

A candidate wins the address round only when all of the following are true on
the unseen holdout:

1. Higher exact span F1 than Azure PII alone and Azure PII+NER.
2. Fewer material partial leaks and fewer full leaks than Azure PII+NER.
3. Higher exact ADDRESS recall than shipped v18.
4. No meaningful ADDRESS precision loss versus shipped v18.
5. Every existing q4 publish gate still passes.

The desired safety bar is zero full address leaks and no exposed house number
or range endpoint. If Maskera wins F1 but loses material coverage, it does not
win the privacy task. If the holdout win is narrow, run a paired McNemar or
paired bootstrap analysis before making a marketing claim.

Only after the decision should release metadata, model hashes, demo pins,
model card, changelog, and every benchmark snapshot carrier be updated. Never
publish directly from a teacher or fp32 score; the product ships q4 plus
reconstruction, so that is what must win.
