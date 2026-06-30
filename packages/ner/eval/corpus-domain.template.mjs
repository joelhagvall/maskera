/**
 * TEMPLATE: grade maskera-sv-ner on YOUR OWN real Swedish text.
 *
 * The bundled corpus.mjs is curated (clean, easy) and the Swedish NER Corpus
 * benchmark is news text. Neither matches your actual domain (chat messages,
 * support emails, medical notes, contracts...). The only way to know how the
 * model does on YOUR data is to grade it on YOUR data.
 *
 * HOW TO USE:
 *   1. Copy this file:  cp corpus-domain.template.mjs corpus-domain.mjs
 *      (corpus-domain.mjs is gitignored so real text never gets committed.)
 *   2. Replace the examples below with 30+ real sentences from your domain.
 *      Annotate every person/place/organisation span by its exact substring.
 *      Add hard negatives (sentences with no PII) too, to keep precision honest.
 *   3. Run it through the same harness:
 *        CORPUS_FILE="./corpus-domain.mjs" \
 *        MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *        node packages/ner/eval/run-eval.mjs
 *
 * The integrity check still applies: every `value` must appear verbatim in its
 * `text`, or scoring throws. Labels: PERSON | LOCATION | ORGANIZATION.
 *
 * The examples below are deliberately fake placeholders. DELETE them.
 */

/** @type {Array<{text: string, entities: Array<{value: string, label: string, nth?: number}>}>} */
export const corpus = [
  {
    text: "hej kan du kolla med anna pa supporten om mitt arende",
    entities: [{ value: "anna", label: "PERSON" }],
  },
  {
    text: "Pat. inkommer fran Solna, anhorig (syster Karin) kontaktad.",
    entities: [
      { value: "Solna", label: "LOCATION" },
      { value: "Karin", label: "PERSON" },
    ],
  },
  {
    text: "Avtalet löper vidare och inget mer behöver göras nu.",
    entities: [],
  },
]
