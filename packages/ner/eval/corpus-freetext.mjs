/**
 * Free-text demo gold corpus: PII-dense sentences of the kind people actually
 * paste into the demo's "Egen text" from the industries maskera targets (HR,
 * kundtjänst, vård, juridik, kommun/socialtjänst, bank/försäkring) plus the
 * informal chat register. First graded against v15 on 2026-07-16.
 *
 * All people and companies are invented combinations. Case references carry
 * an explicit TEST marker; structured identifiers are owner-published test
 * values (see docs/TEST_DATA.md). Structured
 * values (personnummer, telefon, IBAN, kort ...) appear as realistic context
 * but are the rules layer's job and are NOT annotated: entities list only
 * what the model layer must catch (PERSON/LOCATION/ORGANIZATION/ADDRESS).
 *
 * Deliberately hard, tracked cases: lowercase nicknames mid-sentence
 * ("micke", the known register gap), lowercase hyphenated names, af-names,
 * initials, titles, ALL CAPS, foreign names (Vietnamese, Polish, Finnish,
 * Arabic, Danish), saint-prefixed streets and fastighetsbeteckning context.
 *
 * Grade with:
 *   CORPUS_FILE="./corpus-freetext.mjs" \
 *   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *   MASKERA_MODEL=maskera-sv-ner-v19 \
 *   node packages/ner/eval/run-eval.mjs
 */

/** @type {Array<{text: string, entities: Array<{value: string, label: string, nth?: number}>}>} */
export const corpus = [
  // --- HR / rekrytering ---
  {
    text: "Kandidat Nguyen Thi Lan, 19991201-2391, söker tjänsten som redovisningsekonom hos Nordvind Energi AB i Sundsvall. Referens: Gunilla Ståhle-Wik, 070-174 06 41.",
    entities: [
      { value: "Nguyen Thi Lan", label: "PERSON" },
      { value: "Nordvind Energi AB", label: "ORGANIZATION" },
      { value: "Sundsvall", label: "LOCATION" },
      { value: "Gunilla Ståhle-Wik", label: "PERSON" },
    ],
  },
  {
    text: "Vi erbjuder Jerzy Kowalczyk rollen som drifttekniker på anläggningen i Örnsköldsvik med tillträde i mars.",
    entities: [
      { value: "Jerzy Kowalczyk", label: "PERSON" },
      { value: "Örnsköldsvik", label: "LOCATION" },
    ],
  },
  {
    text: "Exitintervju med Charlotte af Ugglas, regionchef Syd, genomförd av HR-partner Bosse Lindmark.",
    entities: [
      { value: "Charlotte af Ugglas", label: "PERSON" },
      { value: "Bosse Lindmark", label: "PERSON" },
    ],
  },
  {
    text: "RING GUNNEL BJÖRKLUND OMGÅENDE ANG REFERENSTAGNINGEN FÖR TJÄNSTEN I KIRUNA",
    entities: [
      { value: "GUNNEL BJÖRKLUND", label: "PERSON" },
      { value: "KIRUNA", label: "LOCATION" },
    ],
  },
  {
    text: "hej ny här, jag heter tove ahlbäck o jobbar på ica maxi i gävle, ska jag skriva det i cv:t?",
    entities: [
      { value: "tove ahlbäck", label: "PERSON" },
      { value: "ica maxi", label: "ORGANIZATION" },
      { value: "gävle", label: "LOCATION" },
    ],
  },
  // --- kundtjänst ---
  {
    text: "Kund Seija Korhonen (kundnr TEST-KUND-001) vill flytta abonnemanget till Påhittsvägen 3B i Västerås.",
    entities: [
      { value: "Seija Korhonen", label: "PERSON" },
      { value: "Påhittsvägen 3B", label: "ADDRESS" },
      { value: "Västerås", label: "LOCATION" },
    ],
  },
  {
    text: "Ärende TEST-ÄRENDE-002: Amir Haddad ringde från 070-174 06 58 om en dubbeldragning på kortet 4242 4242 4242 4242.",
    entities: [{ value: "Amir Haddad", label: "PERSON" }],
  },
  {
    text: "Mejl från arg kund: ni har fakturerat fel person, jag heter INTE lars-göran öberg och bor inte på maskeravägen 14 i katrineholm.",
    entities: [
      { value: "lars-göran öberg", label: "PERSON" },
      { value: "maskeravägen 14", label: "ADDRESS" },
      { value: "katrineholm", label: "LOCATION" },
    ],
  },
  // --- vård ---
  {
    text: "Pat Yusuf El-Sayed, 19850601-2387, inkommer med bröstsmärta; anhörig dottern Amira El-Sayed nås på 070-174 06 91.",
    entities: [
      { value: "Yusuf El-Sayed", label: "PERSON" },
      { value: "Amira El-Sayed", label: "PERSON" },
    ],
  },
  {
    text: "Remiss till dr Sundelin på ortopeden i Umeå; återbesök bokat åt Marta Wisniewska.",
    entities: [
      { value: "Sundelin", label: "PERSON" },
      { value: "Umeå", label: "LOCATION" },
      { value: "Marta Wisniewska", label: "PERSON" },
    ],
  },
  {
    text: "journalanteckning: pat mår bättre, maken sven-erik hämtar henne imorgon, hemtjänsten i bollnäs informerad",
    entities: [
      { value: "sven-erik", label: "PERSON" },
      { value: "bollnäs", label: "LOCATION" },
    ],
  },
  {
    text: "Asylsökande med samordningsnummer 19640372-2397 listas hos vårdcentralen Granlunden i Flen.",
    entities: [
      { value: "Granlunden", label: "ORGANIZATION" },
      { value: "Flen", label: "LOCATION" },
    ],
  },
  // --- juridik ---
  {
    text: "Kärande Ali Reza Pour yrkar ersättning av Bergakommunen, org.nr 202100-4748, ombud: advokat Öqvist, Wiklunds Advokatbyrå KB.",
    entities: [
      { value: "Ali Reza Pour", label: "PERSON" },
      { value: "Bergakommunen", label: "ORGANIZATION" },
      { value: "Öqvist", label: "PERSON" },
      { value: "Wiklunds Advokatbyrå KB", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Testfastigheten TEST:1 i Hultsfreds kommun överlåts från dödsboet efter P. Sjöqvist.",
    entities: [
      { value: "Hultsfreds kommun", label: "LOCATION" },
      { value: "P. Sjöqvist", label: "PERSON" },
    ],
  },
  {
    text: "Testamente: min bostadsrätt på Sankt Testolofsgatan 11B i Uppsala tillfaller systerdottern Linnea Vikström-Blad.",
    entities: [
      { value: "Sankt Testolofsgatan 11B", label: "ADDRESS" },
      { value: "Uppsala", label: "LOCATION" },
      { value: "Linnea Vikström-Blad", label: "PERSON" },
    ],
  },
  // --- kommun / socialtjänst / skola ---
  {
    text: "Orosanmälan gällande eleven Elias Mbeki, klass 4B på Tallkronans skola i Rinkeby; vårdnadshavare nås på 08-465 004 33.",
    entities: [
      { value: "Elias Mbeki", label: "PERSON" },
      { value: "Tallkronans skola", label: "ORGANIZATION" },
      { value: "Rinkeby", label: "LOCATION" },
    ],
  },
  {
    text: "Försörjningsstöd beviljas för Jonas Wikström, 20020301-2398, boende Maskeragränd 2 i Eskilstuna.",
    entities: [
      { value: "Jonas Wikström", label: "PERSON" },
      { value: "Maskeragränd 2", label: "ADDRESS" },
      { value: "Eskilstuna", label: "LOCATION" },
    ],
  },
  {
    text: "bygglovsärende: grannen bengt åkerlund på tomten bredvid har klagat, hör av er till honom på bengt.akerlund@example.com",
    entities: [{ value: "bengt åkerlund", label: "PERSON" }],
  },
  // --- bank / försäkring ---
  {
    text: "Skadeanmälan: Fatima Al-Rashid, vattenskada på Provdatavägen 8 i Sandviken, ersättning till IBAN SE42 8000 0890 1191 4616 8423.",
    entities: [
      { value: "Fatima Al-Rashid", label: "PERSON" },
      { value: "Provdatavägen 8", label: "ADDRESS" },
      { value: "Sandviken", label: "LOCATION" },
    ],
  },
  {
    text: "Lånelöfte utfärdat för paret Astrid Månsson och Søren Kjærgaard, kontakta handläggare Pia Ruotsalainen på 031-390 06 22.",
    entities: [
      { value: "Astrid Månsson", label: "PERSON" },
      { value: "Søren Kjærgaard", label: "PERSON" },
      { value: "Pia Ruotsalainen", label: "PERSON" },
    ],
  },
  // --- informell chatt ---
  {
    text: "grattis pelle o stina till huset i tygelsjö!! när flyttar ni in",
    entities: [
      { value: "pelle", label: "PERSON" },
      { value: "stina", label: "PERSON" },
      { value: "tygelsjö", label: "LOCATION" },
    ],
  },
  {
    // Lowercase nickname mid-sentence: the fragile class. v15 catches this
    // workplace variant but leaks the neighbourly one below (both graded
    // 2026-07-16); together they track the informal-register nickname gap.
    text: "micke på ekonomiavdelningen har inte attesterat fakturan än",
    entities: [{ value: "micke", label: "PERSON" }],
  },
  {
    text: "kan du sammanfatta bråket mellan mig och micke i grannsamfälligheten",
    entities: [{ value: "micke", label: "PERSON" }],
  },
  {
    text: "ang mötet: stäm av med hr-chefen ulla-britt innan du mejlar vd:n på hakan.storm@example.net",
    entities: [{ value: "ulla-britt", label: "PERSON" }],
  },
  {
    text: "ny tjej på jobbet, heter yasmin tror jag, började på lagret i veckan",
    entities: [{ value: "yasmin", label: "PERSON" }],
  },
  {
    text: "PAKETET SKICKAS MED POSTNORD TILL TERMINALEN I HALLSBERG",
    entities: [
      { value: "POSTNORD", label: "ORGANIZATION" },
      { value: "HALLSBERG", label: "LOCATION" },
    ],
  },
  // --- hard negatives: branschtext utan entiteter ---
  {
    text: "Fakturan förfaller den 30 juni och dröjsmålsränta utgår enligt räntelagen.",
    entities: [],
  },
  {
    text: "Patienten upplever förbättring efter insatt behandling och skrivs ut i morgon.",
    entities: [],
  },
  {
    text: "Styrelsen beslutade att flytta årsstämman till första kvartalet.",
    entities: [],
  },
]
