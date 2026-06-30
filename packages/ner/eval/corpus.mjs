/**
 * EVAL CORPUS ("facit") for the Swedish NER model.
 *
 * This is the gold-standard dataset the model is graded against. It is plain
 * data on purpose: no model, no dependencies, runs anywhere. The day the model
 * ships, `run-eval.mjs` runs it over these sentences and reports precision /
 * recall / F1 (see ./score.mjs).
 *
 * SCOPE: only the *free-text* entities the rule layer cannot catch — names of
 * people, places and organisations. Structured PII (personnummer, IBAN, phone…)
 * is the deterministic rule layer's job and is tested in @maskera/core, so it
 * does NOT belong here.
 *
 * FORMAT: each entry is { text, entities }. An entity is { value, label } and,
 * when the same string appears more than once, { value, label, nth } (1-based)
 * to pick which occurrence. Character spans are resolved from `value` at load
 * time (see resolveSpans in ./score.mjs) so you never hand-count offsets.
 *
 * LABELS: PERSON | LOCATION | ORGANIZATION  (the model's coarse free-text set).
 *
 * HOW TO GROW IT: when the model misses or over-flags something in real use,
 * add the sentence here with the correct entities. The eval score then tracks
 * whether future model versions fix or regress it.
 */

/** @typedef {"PERSON" | "LOCATION" | "ORGANIZATION"} EvalLabel */
/** @typedef {{ value: string, label: EvalLabel, nth?: number }} EvalEntity */
/** @typedef {{ text: string, entities: EvalEntity[] }} EvalDoc */

/** @type {EvalDoc[]} */
export const corpus = [
  // --- People: given + surname, the core case ----------------------------
  {
    text: "Jag heter Anna Lindqvist och bor i Göteborg.",
    entities: [
      { value: "Anna Lindqvist", label: "PERSON" },
      { value: "Göteborg", label: "LOCATION" },
    ],
  },
  {
    text: "Mötet hölls med Erik Johansson och Maria Sundberg.",
    entities: [
      { value: "Erik Johansson", label: "PERSON" },
      { value: "Maria Sundberg", label: "PERSON" },
    ],
  },
  {
    text: "Handläggaren Karl-Gustav Åberg återkommer på måndag.",
    entities: [{ value: "Karl-Gustav Åberg", label: "PERSON" }],
  },
  {
    text: "Hej Björn, kan du ringa Sofia imorgon?",
    entities: [
      { value: "Björn", label: "PERSON" },
      { value: "Sofia", label: "PERSON" },
    ],
  },

  // --- Places: cities, regions, streets-as-place -------------------------
  {
    text: "Tåget från Malmö till Stockholm var försenat.",
    entities: [
      { value: "Malmö", label: "LOCATION" },
      { value: "Stockholm", label: "LOCATION" },
    ],
  },
  {
    text: "Vi har kontor i Umeå, Linköping och Helsingborg.",
    entities: [
      { value: "Umeå", label: "LOCATION" },
      { value: "Linköping", label: "LOCATION" },
      { value: "Helsingborg", label: "LOCATION" },
    ],
  },
  {
    text: "Hon flyttade till Kiruna förra året.",
    entities: [{ value: "Kiruna", label: "LOCATION" }],
  },

  // --- Organisations: companies, agencies, by name -----------------------
  {
    text: "Fakturan kommer från Volvo Lastvagnar nästa vecka.",
    entities: [{ value: "Volvo Lastvagnar", label: "ORGANIZATION" }],
  },
  {
    text: "Ansökan skickas till Skatteverket och Försäkringskassan.",
    entities: [
      { value: "Skatteverket", label: "ORGANIZATION" },
      { value: "Försäkringskassan", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Anställd på Ericsson sedan 2015.",
    entities: [{ value: "Ericsson", label: "ORGANIZATION" }],
  },

  // --- Mixed: the realistic case, several types at once ------------------
  {
    text: "Lars Eriksson på IKEA i Älmhult kontaktade kommunen.",
    entities: [
      { value: "Lars Eriksson", label: "PERSON" },
      { value: "IKEA", label: "ORGANIZATION" },
      { value: "Älmhult", label: "LOCATION" },
    ],
  },
  {
    text: "Enligt Anna ska Spotify öppna ett nytt kontor i Uppsala.",
    entities: [
      { value: "Anna", label: "PERSON" },
      { value: "Spotify", label: "ORGANIZATION" },
      { value: "Uppsala", label: "LOCATION" },
    ],
  },

  // --- Hard negatives: sentences with NO free-text PII -------------------
  // These guard against over-flagging. The model should return nothing here.
  {
    text: "Vi träffas på fredag och går igenom budgeten tillsammans.",
    entities: [],
  },
  {
    text: "Rapporten visar att försäljningen ökade under hösten.",
    entities: [],
  },
  {
    text: "Kan du skicka mig sammanfattningen innan lunch?",
    entities: [],
  },

  // --- Tricky: capitalised common words that look like names ------------
  {
    text: "På Norra stationen byter du till buss mot centrum.",
    entities: [],
  },
  {
    text: "Möt mig vid Stora torget klockan tolv.",
    entities: [],
  },

  // --- Repeated entity: same name twice (nth disambiguation) ------------
  {
    text: "Anna mejlade igår, och Anna ringde idag.",
    entities: [
      { value: "Anna", label: "PERSON", nth: 1 },
      { value: "Anna", label: "PERSON", nth: 2 },
    ],
  },
]
