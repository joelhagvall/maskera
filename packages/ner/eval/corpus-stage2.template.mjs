/**
 * TEMPLATE: Stage 2 independent gold set (support/chat register).
 *
 * Implements stage 2 of docs/GOLD_SET_PLAN.md: sentences written by other
 * people (never the training-data generator's author), in the register that
 * matters most in production, chat/support text: lowercase, typos, first
 * person. All PII is invented-but-plausible, so this corpus is lawful to keep
 * and (once large enough) publish.
 *
 * HOW TO USE:
 *   1. Copy this file:  cp corpus-stage2.template.mjs corpus-stage2.mjs
 *      (corpus-stage2.mjs is gitignored so drafts never get committed until you
 *      decide the whole set is publish-clean.)
 *   2. Paste the writers' raw sentences (see docs/GOLD_SET_STAGE2_PROMPTS.md),
 *      then annotate every PERSON / LOCATION / ORGANIZATION span by its exact
 *      substring. Annotate BEFORE running the model, so gold isn't anchored to
 *      model output (GOLD_SET_PLAN.md "Annotation protocol").
 *   3. Grade it through the same harness, no code change:
 *        CORPUS_FILE="./corpus-stage2.mjs" \
 *        MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *        MASKERA_MODEL=maskera-sv-ner-v11 \
 *        MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
 *        node packages/ner/eval/run-eval.mjs
 *
 * ANNOTATION RULES (identical to the curated corpus, so numbers are comparable):
 *   - Labels: PERSON | LOCATION | ORGANIZATION only. Street addresses, personnr,
 *     phone etc. are the rule layer's job, NOT the model's, so do NOT annotate
 *     them here; leave them as unlabeled distractors that the model must ignore.
 *   - Exact spans. The genitive -s stays OUTSIDE the span ("annas" -> value "anna").
 *   - `value` must appear verbatim in `text`, or the harness throws on load.
 *   - If the same value occurs more than once and you mean the 2nd, set `nth: 2`.
 *   - Include some entity-free messages (entities: []) to keep precision honest.
 *
 * PROVENANCE (GOLD_SET_PLAN.md "Reporting"): keep the metadata below per item.
 * The harness ignores unknown keys, so it's carried for free. `register` lets
 * you later split BENCHMARKS.md rows by register instead of blending them.
 *
 * The examples below are FAKE placeholders that show the format. DELETE them and
 * replace with the writers' real (invented-PII) messages.
 */

/**
 * @typedef {Object} GoldDoc
 * @property {string} text
 * @property {Array<{value: string, label: "PERSON"|"LOCATION"|"ORGANIZATION", nth?: number}>} entities
 * @property {string} [writer]        anonymised writer id, e.g. "W1" (never a real name)
 * @property {string} [register]      "support" | "healthcare" | "authority" | "everyday"
 * @property {string} [collected]     ISO date the message was written, e.g. "2026-07-10"
 */

/** @type {GoldDoc[]} */
export const corpus = [
  {
    text: "hörru kan du kolla med fatima på supporten om mitt ärende, hon vet",
    entities: [{ value: "fatima", label: "PERSON" }],
    writer: "W1",
    register: "support",
    collected: "2026-07-10",
  },
  {
    text: "jag flyttar till en ny lägenhet på storgatan 148 i solna, kan ni uppdatera",
    entities: [{ value: "solna", label: "LOCATION" }],
    writer: "W1",
    register: "authority",
    collected: "2026-07-10",
  },
  {
    text: "hej det är mohammed igen, min bror aleksander är inlagd på sahlgrenska",
    entities: [
      { value: "mohammed", label: "PERSON" },
      { value: "aleksander", label: "PERSON" },
      { value: "sahlgrenska", label: "ORGANIZATION" },
    ],
    writer: "W2",
    register: "healthcare",
    collected: "2026-07-11",
  },
  {
    text: "tack så mycket, då väntar jag på återkoppling",
    entities: [],
    writer: "W2",
    register: "support",
    collected: "2026-07-11",
  },
]
