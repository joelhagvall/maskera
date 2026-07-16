/**
 * EVAL CORPUS ("facit") for the Swedish NER model.
 *
 * This is the gold-standard dataset the model is graded against. It is plain
 * data on purpose: no model, no dependencies, runs anywhere. The day the model
 * ships, `run-eval.mjs` runs it over these sentences and reports precision /
 * recall / F1 (see ./score.mjs).
 *
 * SCOPE: only the *free-text* entities the rule layer cannot catch: names of
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
 * whether future model versions fix or regress it. Keep a healthy share of
 * "hard negatives" (sentences with no entities) so precision stays honest.
 */

/** @typedef {"PERSON" | "LOCATION" | "ORGANIZATION"} EvalLabel */
/** @typedef {{ value: string, label: EvalLabel, nth?: number }} EvalEntity */
/** @typedef {{ text: string, entities: EvalEntity[] }} EvalDoc */

/** @type {EvalDoc[]} */
export const corpus = [
  // === PEOPLE ============================================================
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
  {
    text: "Enligt Johan Karlsson ska rapporten vara klar på fredag.",
    entities: [{ value: "Johan Karlsson", label: "PERSON" }],
  },
  {
    text: "Vi anställde Emma Nilsson och Oskar Persson i våras.",
    entities: [
      { value: "Emma Nilsson", label: "PERSON" },
      { value: "Oskar Persson", label: "PERSON" },
    ],
  },
  {
    text: "Fråga Elin om hon har sett protokollet.",
    entities: [{ value: "Elin", label: "PERSON" }],
  },
  {
    text: "Professor Gustav Bergström höll föreläsningen.",
    entities: [{ value: "Gustav Bergström", label: "PERSON" }],
  },
  {
    text: "Karin Lundgren tar över projektet efter semestern.",
    entities: [{ value: "Karin Lundgren", label: "PERSON" }],
  },
  {
    text: "Det var Nils som skrev avtalet, inte Astrid.",
    entities: [
      { value: "Nils", label: "PERSON" },
      { value: "Astrid", label: "PERSON" },
    ],
  },
  {
    text: "Per Olof Svensson och Linnéa Forsberg leder gruppen.",
    entities: [
      { value: "Per Olof Svensson", label: "PERSON" },
      { value: "Linnéa Forsberg", label: "PERSON" },
    ],
  },
  {
    text: "Hälsa Henrik att Ingrid kommer sent.",
    entities: [
      { value: "Henrik", label: "PERSON" },
      { value: "Ingrid", label: "PERSON" },
    ],
  },
  {
    text: "Mattias Ekström ringde angående offerten.",
    entities: [{ value: "Mattias Ekström", label: "PERSON" }],
  },
  {
    text: "Sara och Anders gifte sig förra sommaren.",
    entities: [
      { value: "Sara", label: "PERSON" },
      { value: "Anders", label: "PERSON" },
    ],
  },
  {
    text: "Chefen Lena Åkesson godkände budgeten.",
    entities: [{ value: "Lena Åkesson", label: "PERSON" }],
  },
  {
    text: "Fredrik Nyström flyttade hem till sina föräldrar.",
    entities: [{ value: "Fredrik Nyström", label: "PERSON" }],
  },
  {
    text: "Eva berättade att Daniel slutar i juni.",
    entities: [
      { value: "Eva", label: "PERSON" },
      { value: "Daniel", label: "PERSON" },
    ],
  },
  {
    text: "Malin Hellström vann tävlingen i fjol.",
    entities: [{ value: "Malin Hellström", label: "PERSON" }],
  },
  {
    text: "Min mormor Cecilia fyller nittio i år.",
    entities: [{ value: "Cecilia", label: "PERSON" }],
  },
  {
    text: "Rikard Wikström och Hanna Dahl delar kontor.",
    entities: [
      { value: "Rikard Wikström", label: "PERSON" },
      { value: "Hanna Dahl", label: "PERSON" },
    ],
  },
  {
    text: "Stefan sa att Klara redan har svarat.",
    entities: [
      { value: "Stefan", label: "PERSON" },
      { value: "Klara", label: "PERSON" },
    ],
  },
  {
    text: "Domaren hette Tomas Falk.",
    entities: [{ value: "Tomas Falk", label: "PERSON" }],
  },
  {
    text: "Maja och Viktor anmälde sig till kursen.",
    entities: [
      { value: "Maja", label: "PERSON" },
      { value: "Viktor", label: "PERSON" },
    ],
  },
  {
    text: "Frida Ahlberg är vår nya revisor.",
    entities: [{ value: "Frida Ahlberg", label: "PERSON" }],
  },
  {
    text: "Jonas Lund presenterade resultaten för styrelsen.",
    entities: [{ value: "Jonas Lund", label: "PERSON" }],
  },

  // === PLACES ============================================================
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
  {
    text: "Konferensen äger rum i Örebro nästa vecka.",
    entities: [{ value: "Örebro", label: "LOCATION" }],
  },
  {
    text: "Från Västerås till Norrköping tar det två timmar.",
    entities: [
      { value: "Västerås", label: "LOCATION" },
      { value: "Norrköping", label: "LOCATION" },
    ],
  },
  {
    text: "Min familj kommer ursprungligen från Skåne.",
    entities: [{ value: "Skåne", label: "LOCATION" }],
  },
  {
    text: "Vi åkte skidor i Åre över påsken.",
    entities: [{ value: "Åre", label: "LOCATION" }],
  },
  {
    text: "Det finns en fin strand utanför Ystad.",
    entities: [{ value: "Ystad", label: "LOCATION" }],
  },
  {
    text: "Hon studerar i Lund men jobbar i Gävle.",
    entities: [
      { value: "Lund", label: "LOCATION" },
      { value: "Gävle", label: "LOCATION" },
    ],
  },
  {
    text: "Festivalen hålls i Visby varje sommar.",
    entities: [{ value: "Visby", label: "LOCATION" }],
  },
  {
    text: "Vägen mot Sundsvall var halkig i morse.",
    entities: [{ value: "Sundsvall", label: "LOCATION" }],
  },
  {
    text: "De bor på Södermalm sedan tio år tillbaka.",
    entities: [{ value: "Södermalm", label: "LOCATION" }],
  },
  {
    text: "Kontoret ligger i Jönköping nära sjön.",
    entities: [{ value: "Jönköping", label: "LOCATION" }],
  },
  {
    text: "Vi semestrade i Dalarna och sedan på Gotland.",
    entities: [
      { value: "Dalarna", label: "LOCATION" },
      { value: "Gotland", label: "LOCATION" },
    ],
  },
  {
    text: "Flyget landar i Luleå klockan sju.",
    entities: [{ value: "Luleå", label: "LOCATION" }],
  },
  {
    text: "Hennes släkt bor i Karlstad och Växjö.",
    entities: [
      { value: "Karlstad", label: "LOCATION" },
      { value: "Växjö", label: "LOCATION" },
    ],
  },
  {
    text: "Marknaden i Kalmar lockar många turister.",
    entities: [{ value: "Kalmar", label: "LOCATION" }],
  },
  {
    text: "Vandringen börjar strax utanför Östersund.",
    entities: [{ value: "Östersund", label: "LOCATION" }],
  },
  {
    text: "Fabriken i Trollhättan ska byggas ut.",
    entities: [{ value: "Trollhättan", label: "LOCATION" }],
  },

  // === ORGANISATIONS =====================================================
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
  {
    text: "Hon fick jobb hos Klarna efter examen.",
    entities: [{ value: "Klarna", label: "ORGANIZATION" }],
  },
  {
    text: "Scania och Sandvik redovisade starka kvartalssiffror.",
    entities: [
      { value: "Scania", label: "ORGANIZATION" },
      { value: "Sandvik", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Vi handlar oftast på ICA och Systembolaget.",
    entities: [
      { value: "ICA", label: "ORGANIZATION" },
      { value: "Systembolaget", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Paketet skickades med Postnord igår.",
    entities: [{ value: "Postnord", label: "ORGANIZATION" }],
  },
  {
    text: "Han pluggar på Chalmers i Göteborg.",
    entities: [
      { value: "Chalmers", label: "ORGANIZATION" },
      { value: "Göteborg", label: "LOCATION" },
    ],
  },
  {
    text: "Lånet beviljades av Handelsbanken.",
    entities: [{ value: "Handelsbanken", label: "ORGANIZATION" }],
  },
  {
    text: "Elavtalet tecknades med Vattenfall.",
    entities: [{ value: "Vattenfall", label: "ORGANIZATION" }],
  },
  {
    text: "Migrationsverket handlägger ärendet just nu.",
    entities: [{ value: "Migrationsverket", label: "ORGANIZATION" }],
  },
  {
    text: "Telia och SEB inledde ett samarbete.",
    entities: [
      { value: "Telia", label: "ORGANIZATION" },
      { value: "SEB", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Forskningen finansieras av Karolinska Institutet.",
    entities: [{ value: "Karolinska Institutet", label: "ORGANIZATION" }],
  },
  {
    text: "Securitas ansvarar för bevakningen.",
    entities: [{ value: "Securitas", label: "ORGANIZATION" }],
  },
  {
    text: "Trafikverket varnar för halka på vägarna.",
    entities: [{ value: "Trafikverket", label: "ORGANIZATION" }],
  },

  // === MIXED (several types in one sentence) =============================
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
  {
    text: "Sofia Berg flyttade från Borås för att jobba på H&M i Stockholm.",
    entities: [
      { value: "Sofia Berg", label: "PERSON" },
      { value: "Borås", label: "LOCATION" },
      { value: "H&M", label: "ORGANIZATION" },
      { value: "Stockholm", label: "LOCATION" },
    ],
  },
  {
    text: "Oskar Lindberg representerar Sandvik på mässan i Hannover.",
    entities: [
      { value: "Oskar Lindberg", label: "PERSON" },
      { value: "Sandvik", label: "ORGANIZATION" },
      { value: "Hannover", label: "LOCATION" },
    ],
  },
  {
    text: "Maria Holm på Region Skåne träffade ministern i Malmö.",
    entities: [
      { value: "Maria Holm", label: "PERSON" },
      { value: "Region Skåne", label: "ORGANIZATION" },
      { value: "Malmö", label: "LOCATION" },
    ],
  },
  {
    text: "Erik och Klara startade ett bolag tillsammans i Linköping.",
    entities: [
      { value: "Erik", label: "PERSON" },
      { value: "Klara", label: "PERSON" },
      { value: "Linköping", label: "LOCATION" },
    ],
  },
  {
    text: "Henrik Sandström lämnade Scania för en tjänst i Tyskland.",
    entities: [
      { value: "Henrik Sandström", label: "PERSON" },
      { value: "Scania", label: "ORGANIZATION" },
      { value: "Tyskland", label: "LOCATION" },
    ],
  },
  {
    text: "Astrid Lund pluggar juridik vid Lunds universitet.",
    entities: [
      { value: "Astrid Lund", label: "PERSON" },
      { value: "Lunds universitet", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Postnord anställde Mattias i Örebro under hösten.",
    entities: [
      { value: "Postnord", label: "ORGANIZATION" },
      { value: "Mattias", label: "PERSON" },
      { value: "Örebro", label: "LOCATION" },
    ],
  },
  {
    text: "Vd:n Eva Forsberg ledde Electrolux genom omställningen.",
    entities: [
      { value: "Eva Forsberg", label: "PERSON" },
      { value: "Electrolux", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Daniel och Sara köpte hus i Nyköping nära Stockholm.",
    entities: [
      { value: "Daniel", label: "PERSON" },
      { value: "Sara", label: "PERSON" },
      { value: "Nyköping", label: "LOCATION" },
      { value: "Stockholm", label: "LOCATION" },
    ],
  },
  {
    text: "Karin Nyström på Telia bor numera i Halmstad.",
    entities: [
      { value: "Karin Nyström", label: "PERSON" },
      { value: "Telia", label: "ORGANIZATION" },
      { value: "Halmstad", label: "LOCATION" },
    ],
  },
  {
    text: "Skanska och Vattenfall bygger den nya anläggningen i Piteå.",
    entities: [
      { value: "Skanska", label: "ORGANIZATION" },
      { value: "Vattenfall", label: "ORGANIZATION" },
      { value: "Piteå", label: "LOCATION" },
    ],
  },
  {
    text: "Björn Falk reste från Visby till Uppsala för att möta Linnéa.",
    entities: [
      { value: "Björn Falk", label: "PERSON" },
      { value: "Visby", label: "LOCATION" },
      { value: "Uppsala", label: "LOCATION" },
      { value: "Linnéa", label: "PERSON" },
    ],
  },
  {
    text: "Atlas Copco rekryterade Gustav från Skellefteå.",
    entities: [
      { value: "Atlas Copco", label: "ORGANIZATION" },
      { value: "Gustav", label: "PERSON" },
      { value: "Skellefteå", label: "LOCATION" },
    ],
  },

  // === HARD NEGATIVES (no free-text PII; guards precision) ===============
  { text: "Vi träffas på fredag och går igenom budgeten tillsammans.", entities: [] },
  { text: "Rapporten visar att försäljningen ökade under hösten.", entities: [] },
  { text: "Kan du skicka mig sammanfattningen innan lunch?", entities: [] },
  { text: "Mötet är på torsdag klockan nio i stora konferensrummet.", entities: [] },
  { text: "Fakturan förfaller den sista i månaden.", entities: [] },
  { text: "Vädret blir soligt under helgen enligt prognosen.", entities: [] },
  { text: "Hon arbetar som sjuksköterska på vårdcentralen.", entities: [] },
  { text: "Bussen mot centrum går var tionde minut.", entities: [] },
  { text: "Priset inkluderar frakt, moms och installation.", entities: [] },
  { text: "Vi behöver fler frivilliga till evenemanget på lördag.", entities: [] },
  { text: "Lunchen serveras mellan elva och ett varje dag.", entities: [] },
  { text: "Styrelsen sammanträder nästa tisdag som vanligt.", entities: [] },
  { text: "Projektet försenades på grund av brist på material.", entities: [] },
  { text: "De renoverade köket och badrummet förra sommaren.", entities: [] },
  { text: "Tåget var fullsatt under rusningstrafiken igår.", entities: [] },
  { text: "Ansökan kräver två referenser och ett personligt brev.", entities: [] },
  { text: "Kontoret är stängt under midsommarhelgen.", entities: [] },
  { text: "Vänligen bekräfta din närvaro senast på onsdag.", entities: [] },
  { text: "Den nya policyn träder i kraft vid årsskiftet.", entities: [] },
  { text: "Avdelningen söker en erfaren projektledare till hösten.", entities: [] },

  // Observed in the demo scenarios: the model tagged the role/contact/payment
  // word before or after the real entity ("Kund" and "Mail" as PERSON,
  // "maila" as PERSON, "bankgiro" as ORGANIZATION). The recognizer's denylist
  // drops those; these docs keep that behavior gated.
  {
    text: "Kund Maria Johansson hör av sig: kortet slutar fungera.",
    entities: [{ value: "Maria Johansson", label: "PERSON" }],
  },
  {
    text: "Mail: se kontaktuppgifter i bilagan, tel enligt signaturen.",
    entities: [],
  },
  {
    text: "Sätt in EKG-svar i journalen och maila sammanfattning till patienten.",
    entities: [],
  },
  {
    text: "Betalning sker till bankgiro 991-2346 senast den 12 mars.",
    entities: [],
  },

  // === BATCH 2: more coverage ===========================================
  {
    text: "Greta Albinsson bjöd in hela teamet på middag.",
    entities: [{ value: "Greta Albinsson", label: "PERSON" }],
  },
  {
    text: "Vi väntar fortfarande på svar från Albin.",
    entities: [{ value: "Albin", label: "PERSON" }],
  },
  {
    text: "Olof Gustafsson och Cecilia Pettersson skrev under kontraktet.",
    entities: [
      { value: "Olof Gustafsson", label: "PERSON" },
      { value: "Cecilia Pettersson", label: "PERSON" },
    ],
  },
  {
    text: "Tacka Maja för att hon hjälpte till med flytten.",
    entities: [{ value: "Maja", label: "PERSON" }],
  },
  {
    text: "Frida och Jonas hämtar barnen på onsdag.",
    entities: [
      { value: "Frida", label: "PERSON" },
      { value: "Jonas", label: "PERSON" },
    ],
  },
  {
    text: "Revisorn Stefan Ahlberg granskade boksluten.",
    entities: [{ value: "Stefan Ahlberg", label: "PERSON" }],
  },
  {
    text: "Min kollega Tomas pratade med Klara om saken.",
    entities: [
      { value: "Tomas", label: "PERSON" },
      { value: "Klara", label: "PERSON" },
    ],
  },
  {
    text: "Viktor Olsson tränar laget på helgerna.",
    entities: [{ value: "Viktor Olsson", label: "PERSON" }],
  },
  {
    text: "Det var Ingrid som föreslog den nya rutinen.",
    entities: [{ value: "Ingrid", label: "PERSON" }],
  },
  {
    text: "Per och Eva ska gå i pension nästa år.",
    entities: [
      { value: "Per", label: "PERSON" },
      { value: "Eva", label: "PERSON" },
    ],
  },
  {
    text: "Konserten i Falun blev inställd på grund av storm.",
    entities: [{ value: "Falun", label: "LOCATION" }],
  },
  {
    text: "De seglade från Båstad till Mariestad i somras.",
    entities: [
      { value: "Båstad", label: "LOCATION" },
      { value: "Mariestad", label: "LOCATION" },
    ],
  },
  {
    text: "Stugan ligger en bit utanför Sälen.",
    entities: [{ value: "Sälen", label: "LOCATION" }],
  },
  {
    text: "Vandringsleden går genom Lappland och Norrland.",
    entities: [
      { value: "Lappland", label: "LOCATION" },
      { value: "Norrland", label: "LOCATION" },
    ],
  },
  {
    text: "Hon växte upp i Värmland nära gränsen till Norge.",
    entities: [
      { value: "Värmland", label: "LOCATION" },
      { value: "Norge", label: "LOCATION" },
    ],
  },
  {
    text: "Tävlingen avgörs i Vänersborg på söndag.",
    entities: [{ value: "Vänersborg", label: "LOCATION" }],
  },
  {
    text: "Vi byter tåg i Hallsberg på vägen söderut.",
    entities: [{ value: "Hallsberg", label: "LOCATION" }],
  },
  {
    text: "Lägenheten ligger på Östermalm med utsikt över vattnet.",
    entities: [{ value: "Östermalm", label: "LOCATION" }],
  },
  {
    text: "Resan gick via Köpenhamn och vidare till Berlin.",
    entities: [
      { value: "Köpenhamn", label: "LOCATION" },
      { value: "Berlin", label: "LOCATION" },
    ],
  },
  {
    text: "Det nya lagret hamnar i Motala.",
    entities: [{ value: "Motala", label: "LOCATION" }],
  },
  {
    text: "SAS ställde in flera flyg under strejken.",
    entities: [{ value: "SAS", label: "ORGANIZATION" }],
  },
  {
    text: "Receptet hämtas ut på Apoteket i morgon.",
    entities: [{ value: "Apoteket", label: "ORGANIZATION" }],
  },
  {
    text: "Polismyndigheten och Arbetsförmedlingen samarbetar i projektet.",
    entities: [
      { value: "Polismyndigheten", label: "ORGANIZATION" },
      { value: "Arbetsförmedlingen", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Nyheten sändes i Sveriges Television på kvällen.",
    entities: [{ value: "Sveriges Television", label: "ORGANIZATION" }],
  },
  {
    text: "Stipendiet delas ut av Kungliga biblioteket.",
    entities: [{ value: "Kungliga biblioteket", label: "ORGANIZATION" }],
  },
  {
    text: "SKF redovisade ökad vinst under första kvartalet.",
    entities: [{ value: "SKF", label: "ORGANIZATION" }],
  },
  {
    text: "Tillståndet prövas av Naturvårdsverket.",
    entities: [{ value: "Naturvårdsverket", label: "ORGANIZATION" }],
  },
  {
    text: "Programmet producerades av Sveriges Radio.",
    entities: [{ value: "Sveriges Radio", label: "ORGANIZATION" }],
  },
  {
    text: "Emma Karlsson på Uppsala universitet forskar om klimatet i Norrland.",
    entities: [
      { value: "Emma Karlsson", label: "PERSON" },
      { value: "Uppsala universitet", label: "ORGANIZATION" },
      { value: "Norrland", label: "LOCATION" },
    ],
  },
  {
    text: "Nils Bergström lämnade SEB för att starta eget i Växjö.",
    entities: [
      { value: "Nils Bergström", label: "PERSON" },
      { value: "SEB", label: "ORGANIZATION" },
      { value: "Växjö", label: "LOCATION" },
    ],
  },
  {
    text: "Cecilia reste till Kalmar för att möta kollegor från Securitas.",
    entities: [
      { value: "Cecilia", label: "PERSON" },
      { value: "Kalmar", label: "LOCATION" },
      { value: "Securitas", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Gustav Holm och Linnéa Dahl driver caféet i Sundsvall.",
    entities: [
      { value: "Gustav Holm", label: "PERSON" },
      { value: "Linnéa Dahl", label: "PERSON" },
      { value: "Sundsvall", label: "LOCATION" },
    ],
  },
  {
    text: "Klarna rekryterade Daniel från Spotify i fjol.",
    entities: [
      { value: "Klarna", label: "ORGANIZATION" },
      { value: "Daniel", label: "PERSON" },
      { value: "Spotify", label: "ORGANIZATION" },
    ],
  },
  {
    text: "Maria och Henrik flyttade från Luleå till Lund för studier.",
    entities: [
      { value: "Maria", label: "PERSON" },
      { value: "Henrik", label: "PERSON" },
      { value: "Luleå", label: "LOCATION" },
      { value: "Lund", label: "LOCATION" },
    ],
  },
  {
    text: "Beställningen behandlas inom tre arbetsdagar.",
    entities: [],
  },
  {
    text: "Kursen är fullbokad men du kan ställa dig i kö.",
    entities: [],
  },
  {
    text: "Garantin gäller i två år från inköpsdatum.",
    entities: [],
  },
  {
    text: "Vi uppdaterar systemet under natten mot lördag.",
    entities: [],
  },
  {
    text: "Hyran ska betalas senast den tjugofemte varje månad.",
    entities: [],
  },

  // === TRICKY: same name twice (nth disambiguation) ======================
  {
    text: "Anna mejlade igår, och Anna ringde idag.",
    entities: [
      { value: "Anna", label: "PERSON", nth: 1 },
      { value: "Anna", label: "PERSON", nth: 2 },
    ],
  },
  {
    text: "Först kom Erik, sedan kom Erik tillbaka med kaffe.",
    entities: [
      { value: "Erik", label: "PERSON", nth: 1 },
      { value: "Erik", label: "PERSON", nth: 2 },
    ],
  },

  // === HARD: casing & morphology the model misses today ===================
  // Found in an out-of-template stress test (2026-07-03). Chat users often
  // type all-lowercase, and genitive forms drop entities entirely. Kept here
  // so future training rounds are graded against the gap.
  {
    text: "hej jag heter anna karlsson och bor i uppsala",
    entities: [
      { value: "anna karlsson", label: "PERSON" },
      { value: "uppsala", label: "LOCATION" },
    ],
  },
  {
    text: "kan du skicka det till erik på volvo i göteborg",
    entities: [
      { value: "erik", label: "PERSON" },
      { value: "volvo", label: "ORGANIZATION" },
      { value: "göteborg", label: "LOCATION" },
    ],
  },
  {
    text: "JAG HETER ANNA KARLSSON OCH BOR I UPPSALA",
    entities: [
      { value: "ANNA KARLSSON", label: "PERSON" },
      { value: "UPPSALA", label: "LOCATION" },
    ],
  },
  {
    text: "Det är Annas bil som står utanför.",
    entities: [{ value: "Annas", label: "PERSON" }],
  },
  // Capitalized full-name genitive drops the whole entity (found in an npm
  // user-input stress test, 2026-07-04); lowercase genitive works. Graded
  // here so the next training round closes the gap.
  {
    text: "Det är Anna Karlssons bil som står där.",
    entities: [{ value: "Anna Karlssons", label: "PERSON" }],
  },
  // Two more leaks from the 2026-07-04 stress test, graded so future rounds
  // are measured on them: an ALL CAPS name in a caps sentence, and a bare
  // lowercase first name in a chat turn.
  {
    text: "VIKTIGT: RING LARS NORDSTRÖM OMGÅENDE IDAG.",
    entities: [{ value: "LARS NORDSTRÖM", label: "PERSON" }],
  },
  {
    text: "hejhej det är fatima igen, hör av dig när du kan",
    entities: [{ value: "fatima", label: "PERSON" }],
  },
  {
    text: "Anna Karlssons personnummer finns i akten.",
    entities: [{ value: "Anna Karlssons", label: "PERSON" }],
  },
  {
    text: "Har du läst Johan Anderssons rapport om Norrköping?",
    entities: [
      { value: "Johan Anderssons", label: "PERSON" },
      { value: "Norrköping", label: "LOCATION" },
    ],
  },
  // v16: the "org.nr" frame. The model's ORG span must stop at the name and
  // not swallow the identifier-label word ("Kommun A, org" leaving ".nr"
  // dangling was a real demo find, fixed in reconstruct()). The org-nr value
  // itself is the rules layer's job and is Skatteverket's Navet test number.
  {
    text: "Skadeståndskravet riktas mot Bergakommunen, org.nr 202100-4748, i sin helhet.",
    entities: [{ value: "Bergakommunen", label: "ORGANIZATION" }],
  },
]
