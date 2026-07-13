/**
 * LinkedIn-domain gold corpus: the kind of Swedish text people actually paste
 * from LinkedIn into an AI assistant. Recruiter InMails, congrats posts, job
 * ads, farewell posts, profile bios and event invites — plus hard negatives.
 *
 * All names, companies and events are invented combinations; no real text was
 * copied from LinkedIn. Same format as corpus.mjs, graded with:
 *
 *   CORPUS_FILE="./corpus-linkedin.mjs" \
 *   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *   MASKERA_MODEL=maskera-sv-ner-v13 \
 *   node packages/ner/eval/run-eval.mjs
 *
 * Deliberately hard cases: informal lowercase names, org names that are
 * ordinary capitalized words (King), multiword orgs (Dagens industri,
 * Lunds universitet), multiword places (Sergels torg), and &-names (H&M).
 */

/** @type {Array<{text: string, entities: Array<{value: string, label: string, nth?: number}>}>} */
export const corpus = [
  // --- recruiter messages ---
  {
    text: "Hej Anna! Jag såg din profil och tror att du skulle passa perfekt som senior utvecklare hos Klarna i Stockholm. Hör gärna av dig! /Johan Lindqvist",
    entities: [
      { value: "Anna", label: "PERSON" },
      { value: "Klarna", label: "ORGANIZATION" },
      { value: "Stockholm", label: "LOCATION" },
      { value: "Johan Lindqvist", label: "PERSON" },
    ],
  },
  {
    text: "Rekryterar just nu tre frontendutvecklare till vårt team hos Ikea i Älmhult, skicka ett meddelande om du är nyfiken.",
    entities: [
      { value: "Ikea", label: "ORGANIZATION" },
      { value: "Älmhult", label: "LOCATION" },
    ],
  },
  {
    text: "Letar du nytt jobb inom fintech? Vi växer så det knakar här på Trustly i Sigtuna.",
    entities: [
      { value: "Trustly", label: "ORGANIZATION" },
      { value: "Sigtuna", label: "LOCATION" },
    ],
  },
  {
    text: "Volvo Cars söker en dataingenjör till teamet i Torslanda. Känner du någon som skulle passa?",
    entities: [
      { value: "Volvo Cars", label: "ORGANIZATION" },
      { value: "Torslanda", label: "LOCATION" },
    ],
  },

  // --- connection requests & informal messages ---
  {
    text: "Hej! Vi träffades på mässan i Göteborg förra veckan, vore kul att hålla kontakten. Mvh Sara Nilsson",
    entities: [
      { value: "Göteborg", label: "LOCATION" },
      { value: "Sara Nilsson", label: "PERSON" },
    ],
  },
  {
    text: "hej anna kul att vi sågs på konferensen igår, ska vi ta en kaffe nästa vecka?",
    entities: [{ value: "anna", label: "PERSON" }],
  },
  {
    text: "Är någon i mitt nätverk på väg till mässan i Malmö nästa månad?",
    entities: [{ value: "Malmö", label: "LOCATION" }],
  },

  // --- congrats & celebration posts ---
  {
    text: "Grattis Erik Bergström till nya rollen som CTO på Spotify!",
    entities: [
      { value: "Erik Bergström", label: "PERSON" },
      { value: "Spotify", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Idag firar vi att Amir Haddad gjort tio år hos oss på Scania i Södertälje!",
    entities: [
      { value: "Amir Haddad", label: "PERSON" },
      { value: "Scania", label: "ORGANIZATION" },
      { value: "Södertälje", label: "LOCATION" },
    ],
  },
  {
    text: "Grattis till examen, Linnea! Vilken resa du gjort på KTH.",
    entities: [
      { value: "Linnea", label: "PERSON" },
      { value: "KTH", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Stort grattis Mohammed till certifieringen!",
    entities: [{ value: "Mohammed", label: "PERSON" }],
  },
  {
    text: "Vi på Handelsbanken välkomnar Elin Wikström som ny chef för vårt kontor i Uppsala.",
    entities: [
      { value: "Handelsbanken", label: "ORGANIZATION" },
      { value: "Elin Wikström", label: "PERSON" },
      { value: "Uppsala", label: "LOCATION" },
    ],
  },

  // --- farewell & new-job posts ---
  {
    text: "Efter fem år på Skatteverket går jag vidare till nya äventyr hos Northvolt i Västerås.",
    entities: [
      { value: "Skatteverket", label: "ORGANIZATION" },
      { value: "Northvolt", label: "ORGANIZATION" },
      { value: "Västerås", label: "LOCATION" },
    ],
  },
  {
    text: "Efter sju fantastiska år lämnar jag Telia, tack alla kollegor för den här tiden.",
    entities: [{ value: "Telia", label: "ORGANIZATION" }],
  },
  {
    text: "Flyttlasset har gått från Luleå till Kiruna, nytt jobb på LKAB väntar på måndag.",
    entities: [
      { value: "Luleå", label: "LOCATION" },
      { value: "Kiruna", label: "LOCATION" },
      { value: "LKAB", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Tack Jonas för allt du gjort för teamet, och lycka till Jonas på nya jobbet!",
    entities: [
      { value: "Jonas", label: "PERSON", nth: 1 },
      { value: "Jonas", label: "PERSON", nth: 2 },
    ],
  },

  // --- profile bios ---
  {
    text: "Fullstackutvecklare med åtta års erfarenhet, tidigare på Ericsson och King. Bor i Malmö med familjen.",
    entities: [
      { value: "Ericsson", label: "ORGANIZATION" },
      { value: "King", label: "ORGANIZATION" },
      { value: "Malmö", label: "LOCATION" },
    ],
  },
  {
    text: "Efter examen från Lunds universitet började jag min karriär som konsult i Helsingborg.",
    entities: [
      { value: "Lunds universitet", label: "ORGANIZATION" },
      { value: "Helsingborg", label: "LOCATION" },
    ],
  },

  // --- thank-yous, mentions & event posts ---
  {
    text: "Stort tack till Maria Öberg och hela teamet på H&M för ett fantastiskt samarbete under våren.",
    entities: [
      { value: "Maria Öberg", label: "PERSON" },
      { value: "H&M", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Välkommen på AW med oss på Nordea nu på torsdag, vi ses vid Sergels torg klockan sex.",
    entities: [
      { value: "Nordea", label: "ORGANIZATION" },
      { value: "Sergels torg", label: "LOCATION" },
    ],
  },
  {
    text: "Tack Karin Ek för ett inspirerande föredrag om ledarskap!",
    entities: [{ value: "Karin Ek", label: "PERSON" }],
  },
  {
    text: "Vi ses väl på frukostseminariet hos PwC på Torsgatan imorgon bitti?",
    entities: [
      { value: "PwC", label: "ORGANIZATION" },
      { value: "Torsgatan", label: "LOCATION" },
    ],
  },
  {
    text: "Min kollega Fatima Ahmadi har skrivit en läsvärd rapport om energimarknaden, länk i kommentarerna.",
    entities: [{ value: "Fatima Ahmadi", label: "PERSON" }],
  },
  {
    text: "Stolt över att ha handlett Yusuf under hans exjobb på Chalmers i våras.",
    entities: [
      { value: "Yusuf", label: "PERSON" },
      { value: "Chalmers", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Panelen modereras av Gustav Sandberg från Dagens industri.",
    entities: [
      { value: "Gustav Sandberg", label: "PERSON" },
      { value: "Dagens industri", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Intervjuad i podden om hur vi byggde betallösningen, tack Elsa Lundqvist för bra frågor!",
    entities: [{ value: "Elsa Lundqvist", label: "PERSON" }],
  },
  {
    text: "Vi öppnar nytt kontor i Örebro i höst och söker en platschef.",
    entities: [{ value: "Örebro", label: "LOCATION" }],
  },

  // --- hard negatives: no PII at all ---
  {
    text: "Vilken vecka det har varit, tack alla som kom på vårt event i fredags!",
    entities: [],
  },
  {
    text: "Jag har precis blivit certifierad molnarkitekt, dags att fira med en kanelbulle.",
    entities: [],
  },
  {
    text: "Ser fram emot semestern, sista arbetsdagen för i år idag.",
    entities: [],
  },
  {
    text: "AI kommer att förändra hur vi rekryterar de kommande fem åren, håller ni med?",
    entities: [],
  },
  {
    text: "Vi söker en vd, en ekonomichef och två säljare till vårt kontor i city.",
    entities: [],
  },
]
