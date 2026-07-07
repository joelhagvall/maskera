/**
 * ADR (street-address) eval corpus.
 *
 * WHY THIS EXISTS: the model has four classes (PER / LOC / ORG / ADR), but every
 * other gold set we report on covers only PER / LOC / ORG — the Swedish NER
 * Corpus has no address class, and the curated / stage-2 sets deliberately leave
 * addresses to the rule layer. So `ADR` was the one shipped class with *no*
 * independent number. This set closes that gap: it measures whether the model
 * finds street addresses in free text, and — just as important — whether it
 * over-fires on things that look like addresses but are not (bare numbers, PO
 * boxes, postal codes, phone numbers).
 *
 * PROVENANCE (be honest, per GOLD_SET_PLAN.md "Reporting"):
 *   - Authored for this eval; NONE of these sentences appear in training.
 *   - Street names were chosen to AVOID the training generator's stem list
 *     (training/generate_data.mjs STREET_STEMS) — real Swedish streets like
 *     Sveavägen, Odengatan, Hornsgatan, Renstiernas gata — so the surface forms
 *     are out-of-distribution, not memorised.
 *   - It shares our annotation style (curated, one author), so read it like the
 *     "curated maskera corpus" row, not like the independent Wikipedia set.
 *
 * ANNOTATION GUIDELINE (matches how the model was trained to span an address):
 *   - The ADR span is the street name + house number (+ optional letter):
 *     "Sveavägen 44", "Odengatan 12B". NOT the postal code, city, floor ("3 tr"),
 *     or apartment ("lgh 1201") — those are separate tokens the model should
 *     leave for the rule/LOC layers.
 *   - PER / LOC / ORG in the same sentence are annotated too, so mislabels
 *     (e.g. an address tagged LOCATION) show up in labeled-F1, not just span-F1.
 *   - `label: "ADDRESS"` is what the recognizer emits for ADR (see the
 *     DEFAULT_LABEL_MAP in packages/ner/src/index.ts), so labeled matches line up.
 *   - Every `value` must appear verbatim in `text` or the harness throws on load.
 *   - Address-free sentences (entities: []) and near-miss distractors keep ADR
 *     precision honest: a bare "148", "Box 1203", "112 21", "070-123 45 67" must
 *     NOT be flagged ADDRESS.
 *
 * RUN IT (no code change to the harness):
 *   CORPUS_FILE="./corpus-adr.mjs" \
 *   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v5 \
 *   MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
 *   node packages/ner/eval/run-eval.mjs
 *
 * @typedef {Object} GoldDoc
 * @property {string} text
 * @property {Array<{value: string, label: "PERSON"|"LOCATION"|"ORGANIZATION"|"ADDRESS", nth?: number}>} entities
 * @property {string} [register]  "authority" | "support" | "delivery" | "everyday"
 */

/** @type {GoldDoc[]} */
export const corpus = [
  // --- Addresses in formal / authority prose ---------------------------------
  {
    text: "Beslutet expedierades till Karin Sjögren, Sveavägen 44, 113 59 Stockholm.",
    entities: [
      { value: "Karin Sjögren", label: "PERSON" },
      { value: "Sveavägen 44", label: "ADDRESS" },
      { value: "Stockholm", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Ansökan om bygglov avser fastigheten på Odengatan 12B i Uppsala.",
    entities: [
      { value: "Odengatan 12B", label: "ADDRESS" },
      { value: "Uppsala", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Folkbokföringen visar att Anders Ek är skriven på Hornsgatan 108.",
    entities: [
      { value: "Anders Ek", label: "PERSON" },
      { value: "Hornsgatan 108", label: "ADDRESS" },
    ],
    register: "authority",
  },
  {
    text: "Föreläggandet skickades till Renstiernas gata 22, andra våningen.",
    entities: [{ value: "Renstiernas gata 22", label: "ADDRESS" }],
    register: "authority",
  },
  {
    text: "Verksamheten bedrivs på Regementsgatan 5 i Malmö enligt tillståndet.",
    entities: [
      { value: "Regementsgatan 5", label: "ADDRESS" },
      { value: "Malmö", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Bostaden på Timmermansgatan 19 A ägs av Petra och Johan Wallin.",
    entities: [
      { value: "Timmermansgatan 19 A", label: "ADDRESS" },
      { value: "Petra", label: "PERSON" },
      { value: "Johan Wallin", label: "PERSON" },
    ],
    register: "authority",
  },

  // --- Deliveries / logistics ------------------------------------------------
  {
    text: "Paketet kunde inte lämnas på Folkungagatan 87 så det ligger kvar hos ombudet.",
    entities: [{ value: "Folkungagatan 87", label: "ADDRESS" }],
    register: "delivery",
  },
  {
    text: "Leveransen till Nybrogatan 3 hanteras av PostNord under vecka 28.",
    entities: [
      { value: "Nybrogatan 3", label: "ADDRESS" },
      { value: "PostNord", label: "ORGANIZATION" },
    ],
    register: "delivery",
  },
  {
    text: "Chauffören ringer när han är framme vid Sturegatan 46 C i Sundbyberg.",
    entities: [
      { value: "Sturegatan 46 C", label: "ADDRESS" },
      { value: "Sundbyberg", label: "LOCATION" },
    ],
    register: "delivery",
  },
  {
    text: "Ny leveransadress är Götgatan 15, gamla var Kungsholmsgatan 2.",
    entities: [
      { value: "Götgatan 15", label: "ADDRESS" },
      { value: "Kungsholmsgatan 2", label: "ADDRESS" },
    ],
    register: "delivery",
  },

  // --- Support / chat register (lowercase, sloppy — the hard register) --------
  {
    text: "hej jag har flyttat till upplandsgatan 63 kan ni ändra mina uppgifter",
    entities: [{ value: "upplandsgatan 63", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "hörru fakturan gick till fel adress, jag bor på bondegatan 41 numera",
    entities: [{ value: "bondegatan 41", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "min mamma astrid bor kvar på tegnérgatan 8 men jag flyttade till lund",
    entities: [
      { value: "astrid", label: "PERSON" },
      { value: "tegnérgatan 8", label: "ADDRESS" },
      { value: "lund", label: "LOCATION" },
    ],
    register: "support",
  },
  {
    text: "kan hantverkaren komma till skånegatan 74 b imorgon, jag är hemma efter tre",
    entities: [{ value: "skånegatan 74 b", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "vi har öppnat ny butik på drottninggatan 29 i norrköping, välkomna",
    entities: [
      { value: "drottninggatan 29", label: "ADDRESS" },
      { value: "norrköping", label: "LOCATION" },
    ],
    register: "support",
  },

  // --- Everyday / mixed ------------------------------------------------------
  {
    text: "Mormor Greta bodde länge på Vasagatan 17 innan hon flyttade till Örebro.",
    entities: [
      { value: "Greta", label: "PERSON" },
      { value: "Vasagatan 17", label: "ADDRESS" },
      { value: "Örebro", label: "LOCATION" },
    ],
    register: "everyday",
  },
  {
    text: "Festen är hemma hos Oskar på Linnégatan 52, fjärde våningen.",
    entities: [
      { value: "Oskar", label: "PERSON" },
      { value: "Linnégatan 52", label: "ADDRESS" },
    ],
    register: "everyday",
  },
  {
    text: "Vårdcentralen på Fleminggatan 22 tog över patienterna från den gamla mottagningen.",
    entities: [{ value: "Fleminggatan 22", label: "ADDRESS" }],
    register: "everyday",
  },
  {
    text: "Cykeln stod olåst utanför Swedbank på Hamngatan 10 hela natten.",
    entities: [
      { value: "Swedbank", label: "ORGANIZATION" },
      { value: "Hamngatan 10", label: "ADDRESS" },
    ],
    register: "everyday",
  },
  {
    text: "Emma och Daniel Lindqvist köpte huset på Ynglingavägen 4 D förra året.",
    entities: [
      { value: "Emma", label: "PERSON" },
      { value: "Daniel Lindqvist", label: "PERSON" },
      { value: "Ynglingavägen 4 D", label: "ADDRESS" },
    ],
    register: "everyday",
  },

  // --- Address-free + near-miss distractors (precision on ADR) ----------------
  // A bare house number with no street must NOT be an address.
  {
    text: "Jag bor på nummer 148 men vägen har inget namn, det är en gård utanför byn.",
    entities: [],
    register: "everyday",
  },
  // PO box is not a street address.
  {
    text: "Skicka handlingarna till Box 1203, 751 42 Uppsala, inte till kontoret.",
    entities: [{ value: "Uppsala", label: "LOCATION" }],
    register: "authority",
  },
  // Postal code + city, no street.
  {
    text: "Postnumret är 112 21 och orten är Stockholm, gatan minns jag inte.",
    entities: [{ value: "Stockholm", label: "LOCATION" }],
    register: "support",
  },
  // Phone number, not an address.
  {
    text: "ring mig på 070-123 45 67 istället, jag svarar inte på mejl",
    entities: [],
    register: "support",
  },
  // Entity-free chatter.
  {
    text: "tack så mycket för hjälpen, då väntar jag på återkoppling",
    entities: [],
    register: "support",
  },
  // "Stationen" / "torget" are places, not street addresses with a number.
  {
    text: "Vi ses vid Centralstationen i Göteborg klockan sex, inte hemma hos mig.",
    entities: [
      { value: "Centralstationen", label: "LOCATION" },
      { value: "Göteborg", label: "LOCATION" },
    ],
    register: "everyday",
  },
  // A kilometre marker looks numeric but is not an address.
  {
    text: "Olyckan skedde vid kilometer 42 på E4:an söder om Jönköping.",
    entities: [{ value: "Jönköping", label: "LOCATION" }],
    register: "everyday",
  },
]
