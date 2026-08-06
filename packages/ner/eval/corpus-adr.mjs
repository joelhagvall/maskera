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
 *   - Every street name contains an explicit synthetic marker. No plausible
 *     street/number pair is retained, because it could accidentally resolve to
 *     a real property. The shapes remain varied but are not a real-address
 *     benchmark.
 *   - It shares our annotation style (curated, one author), so read it like the
 *     "curated maskera corpus" row, not like the independent Wikipedia set.
 *
 * ANNOTATION GUIDELINE (matches how the model was trained to span an address):
 *   - The ADR span is the street name + house number (+ optional letter):
 *     "Maskeragatan 44", "Provdatavägen 12B". NOT the postal code, city, floor ("3 tr"),
 *     or apartment ("lgh 1201") — those are separate tokens the model should
 *     leave for the rule/LOC layers.
 *   - PER / LOC / ORG in the same sentence are annotated too, so mislabels
 *     (e.g. an address tagged LOCATION) show up in labeled-F1, not just span-F1.
 *   - `label: "ADDRESS"` is what the recognizer emits for ADR (see the
 *     DEFAULT_LABEL_MAP in packages/ner/src/index.ts), so labeled matches line up.
 *   - Every `value` must appear verbatim in `text` or the harness throws on load.
 *   - Address-free sentences (entities: []) and near-miss distractors keep ADR
 *     precision honest: a bare "148", a box label, the owner-published test
 *     postcode "123 45" and reserved phone "070-174 06 58" must
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
    text: "Beslutet expedierades till Karin Sjögren, Maskeragatan 44, Stockholm.",
    entities: [
      { value: "Karin Sjögren", label: "PERSON" },
      { value: "Maskeragatan 44", label: "ADDRESS" },
      { value: "Stockholm", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Ansökan om bygglov avser fastigheten på Provdatavägen 12B i Uppsala.",
    entities: [
      { value: "Provdatavägen 12B", label: "ADDRESS" },
      { value: "Uppsala", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Folkbokföringen visar att Anders Ek är skriven på Fiktivgränd 108.",
    entities: [
      { value: "Anders Ek", label: "PERSON" },
      { value: "Fiktivgränd 108", label: "ADDRESS" },
    ],
    register: "authority",
  },
  {
    text: "Föreläggandet skickades till Exempeldatas gata 22, andra våningen.",
    entities: [{ value: "Exempeldatas gata 22", label: "ADDRESS" }],
    register: "authority",
  },
  {
    text: "Verksamheten bedrivs på Syntetgatan 5 i Malmö enligt tillståndet.",
    entities: [
      { value: "Syntetgatan 5", label: "ADDRESS" },
      { value: "Malmö", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "Bostaden på Testkorpusgatan 19 A ägs av Petra och Johan Wallin.",
    entities: [
      { value: "Testkorpusgatan 19 A", label: "ADDRESS" },
      { value: "Petra", label: "PERSON" },
      { value: "Johan Wallin", label: "PERSON" },
    ],
    register: "authority",
  },

  // --- Deliveries / logistics ------------------------------------------------
  {
    text: "Paketet kunde inte lämnas på Dataskyddstestgatan 87 så det ligger kvar hos ombudet.",
    entities: [{ value: "Dataskyddstestgatan 87", label: "ADDRESS" }],
    register: "delivery",
  },
  {
    text: "Leveransen till Nollpostgatan 3 hanteras av PostNord under vecka 28.",
    entities: [
      { value: "Nollpostgatan 3", label: "ADDRESS" },
      { value: "PostNord", label: "ORGANIZATION" },
    ],
    register: "delivery",
  },
  {
    text: "Chauffören ringer när han är framme vid Provtextgatan 46 C i Sundbyberg.",
    entities: [
      { value: "Provtextgatan 46 C", label: "ADDRESS" },
      { value: "Sundbyberg", label: "LOCATION" },
    ],
    register: "delivery",
  },
  {
    text: "Ny leveransadress är Testadressgatan 15, gamla var Maskerastigen 2.",
    entities: [
      { value: "Testadressgatan 15", label: "ADDRESS" },
      { value: "Maskerastigen 2", label: "ADDRESS" },
    ],
    register: "delivery",
  },

  // --- Support / chat register (lowercase, sloppy — the hard register) --------
  {
    text: "hej jag har flyttat till provdatagatan 63 kan ni ändra mina uppgifter",
    entities: [{ value: "provdatagatan 63", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "hörru fakturan gick till fel adress, jag bor på fiktivgatan 41 numera",
    entities: [{ value: "fiktivgatan 41", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "min mamma astrid bor kvar på exempeldatavägen 8 men jag flyttade till lund",
    entities: [
      { value: "astrid", label: "PERSON" },
      { value: "exempeldatavägen 8", label: "ADDRESS" },
      { value: "lund", label: "LOCATION" },
    ],
    register: "support",
  },
  {
    text: "kan hantverkaren komma till syntetgränd 74 b imorgon, jag är hemma efter tre",
    entities: [{ value: "syntetgränd 74 b", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "vi har öppnat ny butik på testkorpusvägen 29 i norrköping, välkomna",
    entities: [
      { value: "testkorpusvägen 29", label: "ADDRESS" },
      { value: "norrköping", label: "LOCATION" },
    ],
    register: "support",
  },

  // --- Everyday / mixed ------------------------------------------------------
  {
    text: "Mormor Greta bodde länge på Maskeravägen 17 innan hon flyttade till Örebro.",
    entities: [
      { value: "Greta", label: "PERSON" },
      { value: "Maskeravägen 17", label: "ADDRESS" },
      { value: "Örebro", label: "LOCATION" },
    ],
    register: "everyday",
  },
  {
    text: "Festen är hemma hos Oskar på Provdatagränd 52, fjärde våningen.",
    entities: [
      { value: "Oskar", label: "PERSON" },
      { value: "Provdatagränd 52", label: "ADDRESS" },
    ],
    register: "everyday",
  },
  {
    text: "Vårdcentralen på Fiktivvägen 22 tog över patienterna från den gamla mottagningen.",
    entities: [{ value: "Fiktivvägen 22", label: "ADDRESS" }],
    register: "everyday",
  },
  {
    text: "Cykeln stod olåst utanför Swedbank på Exempeldataallén 10 hela natten.",
    entities: [
      { value: "Swedbank", label: "ORGANIZATION" },
      { value: "Exempeldataallén 10", label: "ADDRESS" },
    ],
    register: "everyday",
  },
  {
    text: "Emma och Daniel Lindqvist köpte huset på Syntetstigen 4 D förra året.",
    entities: [
      { value: "Emma", label: "PERSON" },
      { value: "Daniel Lindqvist", label: "PERSON" },
      { value: "Syntetstigen 4 D", label: "ADDRESS" },
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
    text: "Skicka handlingarna till testmiljöns boxadress, inte till kontoret.",
    entities: [],
    register: "authority",
  },
  // Postal code + city, no street.
  {
    text: "Postnumret är det publicerade testvärdet 123 45 och orten är Staden.",
    entities: [],
    register: "support",
  },
  // Phone number, not an address.
  {
    text: "ring mig på 070-174 06 58 istället, jag svarar inte på mejl",
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
    text: "Testhändelsen placerades vid kilometer 42 på provsträckan söder om Jönköping.",
    entities: [{ value: "Jönköping", label: "LOCATION" }],
    register: "everyday",
  },
  // --- Shape variants retained with conspicuous synthetic markers: saint
  // prefixes, free-word endings, farm/village forms, abbreviations, "nr" and
  // -kajen. Historical numbers against the replaced real-looking surfaces are
  // not comparable and must not be reused for this corpus revision.
  // (1) Saint prefixes and colon forms.
  {
    text: "Paketet levererades till Sankt Testolofsgatan 153 under förmiddagen.",
    entities: [{ value: "Sankt Testolofsgatan 153", label: "ADDRESS" }],
    register: "authority",
  },
  {
    text: "Mottagningen har flyttat till S:t Provpersgatan 45 på Kungsholmen.",
    entities: [
      { value: "S:t Provpersgatan 45", label: "ADDRESS" },
      { value: "Kungsholmen", label: "LOCATION" },
    ],
    register: "authority",
  },
  {
    text: "SKICKA FAKTURAN TILL SANKT FIKTIVMÅNSGATAN 8 OMGÅENDE.",
    entities: [{ value: "SANKT FIKTIVMÅNSGATAN 8", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "Kontoret ligger på Maskeras gata 3, mitt emot hamnen.",
    entities: [{ value: "Maskeras gata 3", label: "ADDRESS" }],
    register: "everyday",
  },
  // (2) Streets ending in a free word.
  {
    text: "Butiken på Lilla Testtorget 4 håller stängt under renoveringen.",
    entities: [{ value: "Lilla Testtorget 4", label: "ADDRESS" }],
    register: "everyday",
  },
  {
    text: "Vittnet uppgav adressen Norra Provstranden 24 vid förhöret.",
    entities: [{ value: "Norra Provstranden 24", label: "ADDRESS" }],
    register: "authority",
  },
  {
    text: "hej, flytta prenumerationen till fiktivets strand 12 tack",
    entities: [{ value: "fiktivets strand 12", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "Konferensen hålls hos byrån på Syntetens plats 1.",
    entities: [{ value: "Syntetens plats 1", label: "ADDRESS" }],
    register: "everyday",
  },
  // (3) Rural and farm addresses.
  {
    text: "Familjen är folkbokförd på Maskeragården Testbyn 2 sedan i fjol.",
    entities: [{ value: "Maskeragården Testbyn 2", label: "ADDRESS" }],
    register: "authority",
  },
  {
    text: "Leveransen går till Provbyn 12 i slutet av veckan.",
    entities: [{ value: "Provbyn 12", label: "ADDRESS" }],
    register: "everyday",
  },
  {
    text: "Han bor kvar på Fiktivgården Syntetbyn 3 tillsammans med sin bror.",
    entities: [{ value: "Fiktivgården Syntetbyn 3", label: "ADDRESS" }],
    register: "everyday",
  },
  // (4) Abbreviated stems and the "nr" form.
  {
    text: "Returen skickas till Maskerag. 5 enligt fraktsedeln.",
    entities: [{ value: "Maskerag. 5", label: "ADDRESS" }],
    register: "support",
  },
  {
    text: "Hyresgästen på Provdatagatan nr 5 har sagt upp avtalet.",
    entities: [{ value: "Provdatagatan nr 5", label: "ADDRESS" }],
    register: "authority",
  },
  // (5) The -kajen suffix family.
  {
    text: "Fartyget lastas vid kontoret på Testkorpuskajen 8 i eftermiddag.",
    entities: [{ value: "Testkorpuskajen 8", label: "ADDRESS" }],
    register: "everyday",
  },
]
