/**
 * Synthetic Swedish PII training data generator (v2 — diverse).
 *
 * Emits word-level, BIO-tagged token-classification examples as JSONL:
 *   {"tokens": ["Patient","Anna","Karlsson",...], "tags": ["O","B-PER","I-PER",...]}
 *
 * Teaches the FREE-TEXT entities a rule layer can't catch — names (PER), places
 * (LOC), organisations (ORG), street addresses (ADR). Structured PII
 * (personnummer, org-nr, phone, IBAN…) stays with @maskera/core's detectors.
 *
 * v2 widens diversity to improve generalisation: ~90 templates, much larger
 * gazetteers, entities in varied positions, light augmentation (lowercase start,
 * dropped punctuation), and more negatives/distractors. The hand-authored eval
 * set's specific full names are deliberately NOT included here.
 *
 * Usage: node generate_data.mjs [trainCount] [valCount]
 */
import { writeFileSync } from "node:fs"

let seed = 1337
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = (a) => a[Math.floor(rand() * a.length)]
const chance = (p) => rand() < p

// --- gazetteers ---------------------------------------------------------
const FIRST = [
  "Anna",
  "Lars",
  "Erik",
  "Maria",
  "Johan",
  "Sara",
  "Björn",
  "Astrid",
  "Karin",
  "Per",
  "Eva",
  "Nils",
  "Lena",
  "Anders",
  "Margareta",
  "Sven",
  "Elsa",
  "Oskar",
  "Greta",
  "Ingrid",
  "Gustav",
  "Linnéa",
  "Emil",
  "Stina",
  "Olof",
  "Hanna",
  "Mattias",
  "Sofia",
  "Daniel",
  "Emma",
  "Henrik",
  "Klara",
  "Fredrik",
  "Alice",
  "Jonas",
  "Wilma",
  "Andreas",
  "Maja",
  "Markus",
  "Ebba",
  "Pär",
  "Agnes",
  "Ali",
  "Ahmed",
  "Fatima",
  "Mohammed",
  "Aisha",
  "Hassan",
  "Leila",
  "Yusuf",
  "Omar",
  "Ivan",
  "Aleksandra",
  "Mehmet",
  "Zara",
  "Amir",
  "Nora",
  "Elias",
  "Liam",
  "Hugo",
  "Vera",
  "Ludvig",
  "Tuva",
  "Folke",
  "Börje",
  "Gunilla",
  "Ronny",
  "Siv",
  "Bengt",
  "Ulla",
  "Kjell",
  "Maj",
  "Tore",
  "Roland",
  "Sixten",
  "Yngve",
  "Knut",
  "Dagny",
  "Helmer",
  "Torsten",
  "Majvor",
  "Rune",
  "Britt",
  "Gösta",
  "Åke",
  "Inger",
  "Solveig",
  "Ragnar",
  "Vendela",
  "Algot",
  "Lovisa",
  "Teodor",
  "Valdemar",
  "Priya",
  "Wei",
  "Mateusz",
  "Tendai",
  "Kwame",
  "Ngozi",
  "Dimitrios",
  "Eleni",
  "Bianca",
  "Joaquín",
  "Ahmad",
  "Yara",
  "Vladyslav",
  "Émile",
  "Dragan",
  "Amani",
  "Ibrahim",
  "Wanjiru",
  "Feliks",
  "Désirée",
  "Abdullahi",
  "Nikola",
  "Stojan",
  "Mira",
  "Olga",
  "Hiroshi",
  "Mei",
  "Sanna",
  "Tobias",
  "Cecilia",
  "Joakim",
  "Frida",
  "Viktor",
  "Amanda",
  "Robin",
  "Isabella",
  "Albin",
  "Moa",
  "Felix",
  "Saga",
  "Vidar",
  "Linus",
  "Tilde",
  "Melker",
  "Noa",
  "Iris",
  "Ester",
]
const LAST = [
  "Karlsson",
  "Eriksson",
  "Andersson",
  "Johansson",
  "Nilsson",
  "Larsson",
  "Persson",
  "Svensson",
  "Gustafsson",
  "Pettersson",
  "Jonsson",
  "Jansson",
  "Hansson",
  "Bengtsson",
  "Lindberg",
  "Lindström",
  "Lindqvist",
  "Lindgren",
  "Berg",
  "Bergström",
  "Lundberg",
  "Lundqvist",
  "Lundgren",
  "Berggren",
  "Sandberg",
  "Holmberg",
  "Nyström",
  "Holm",
  "Öberg",
  "Wikström",
  "Isaksson",
  "Fredriksson",
  "Bergman",
  "Forsberg",
  "Sjöberg",
  "Ek",
  "Dahl",
  "Söderberg",
  "Blom",
  "Engström",
  "Eklund",
  "Lund",
  "Hedlund",
  "Sundström",
  "Norberg",
  "Ström",
  "Åberg",
  "Falk",
  "Hagström",
  "Berglund",
  "Sandström",
  "Nyberg",
  "Strandberg",
  "Holmgren",
  "Lindholm",
  "Backman",
  "Ekström",
  "Wallin",
  "Mårtensson",
  "Abrahamsson",
  "Al-Rashid",
  "Hassan",
  "Yilmaz",
  "Demir",
  "Nowak",
  "Ahmadi",
  "Khan",
  "Nguyen",
  "Tran",
  "Kowalski",
  "Petrov",
  "Ivanov",
  "Okafor",
  "Mensah",
  "Costa",
  "Silva",
  "Rossi",
  "Müller",
  "Schmidt",
  "Nakamura",
  "Kovač",
  "Haddad",
  "Saleh",
  "Aziz",
  "Tornberg",
  "Bohlin",
  "Aronsson",
  "Bäckström",
  "Rydberg",
]
const CITIES = [
  "Stockholm",
  "Göteborg",
  "Malmö",
  "Uppsala",
  "Västerås",
  "Örebro",
  "Linköping",
  "Helsingborg",
  "Jönköping",
  "Norrköping",
  "Lund",
  "Umeå",
  "Gävle",
  "Borås",
  "Eskilstuna",
  "Södertälje",
  "Karlstad",
  "Täby",
  "Växjö",
  "Halmstad",
  "Sundsvall",
  "Luleå",
  "Trollhättan",
  "Östersund",
  "Borlänge",
  "Falun",
  "Kalmar",
  "Kristianstad",
  "Skövde",
  "Karlskrona",
  "Visby",
  "Kiruna",
  "Ystad",
  "Sigtuna",
  "Mariestad",
  "Piteå",
  "Sandviken",
  "Hudiksvall",
  "Enköping",
  "Lidingö",
  "Vallentuna",
  "Åre",
  "Sälen",
  "Kungälv",
  "Alingsås",
  "Tumba",
  "Gnesta",
  "Flen",
  "Smögen",
  "Arvika",
  "Ronneby",
  "Tranås",
  "Vimmerby",
  "Hagfors",
  "Skellefteå",
  "Mölndal",
  "Partille",
  "Nyköping",
  "Trosa",
  "Uddevalla",
  "Karlshamn",
  "Strängnäs",
  "Köping",
  "Motala",
  "Nässjö",
  "Värnamo",
  "Ängelholm",
  "Landskrona",
  "Trelleborg",
  "Boden",
  "Härnösand",
  "Örnsköldsvik",
  "Avesta",
  "Ludvika",
  "Säffle",
  "Mariefred",
  "Vänersborg",
  "Lidköping",
  "Katrineholm",
]
const DISTRICTS = [
  "Kungsholmen",
  "Södermalm",
  "Östermalm",
  "Vasastan",
  "Norrmalm",
  "Gamla stan",
  "Hammarby Sjöstad",
  "Solna",
  "Sundbyberg",
  "Nacka",
  "Hisingen",
  "Majorna",
  "Möllevången",
  "Limhamn",
  "Gottsunda",
  "Rosengård",
  "Bergsjön",
  "Husby",
  "Vällingby",
  "Tensta",
  "Bagarmossen",
  "Hökarängen",
  "Skarpnäck",
  "Flemingsberg",
  "Bromma",
  "Liljeholmen",
]
const STREET_STEMS = [
  "Stor",
  "Lill",
  "Norr",
  "Söder",
  "Öster",
  "Väster",
  "Kyrk",
  "Skol",
  "Park",
  "Berg",
  "Sjö",
  "Strand",
  "Ängs",
  "Björk",
  "Ek",
  "Gran",
  "Linde",
  "Ros",
  "Kungs",
  "Drottning",
  "Vasa",
  "Karla",
  "Industri",
  "Hamn",
  "Torg",
  "Brunns",
  "Köpman",
  "Fiskar",
  "Smedje",
  "Bro",
  "Kvarn",
  "Pil",
  "Lärk",
  "Apel",
  "Tall",
  "Häll",
  "Klockare",
  "Bagar",
  "Repslagar",
  "Skomakar",
]
const STREET_SUFFIX = [
  "gatan",
  "vägen",
  "gränd",
  "stigen",
  "torget",
  "backen",
  "allén",
  "plan",
  "gränden",
]
const ORGS = [
  "Volvo",
  "Ericsson",
  "Spotify",
  "IKEA",
  "Scania",
  "Skanska",
  "Telia",
  "Klarna",
  "SEB",
  "Swedbank",
  "Handelsbanken",
  "ICA",
  "Coop",
  "Systembolaget",
  "Vattenfall",
  "Sandvik",
  "Atlas Copco",
  "Electrolux",
  "Securitas",
  "Lindex",
  "Apoteket",
  "Postnord",
  "SAS",
  "SJ",
  "Northvolt",
  "Truecaller",
  "Einride",
  "Storytel",
  "Voi",
  "Tink",
  "Kry",
  "Mathem",
  "Budbee",
  "Paradox Interactive",
  "Mojang",
  "Tobii",
  "Hemnet",
  "Blocket",
  "Boozt",
  "Polestar",
  "Embracer",
  "Willys",
  "Hemköp",
  "Lidl",
  "Åhléns",
  "Clas Ohlson",
  "Dustin",
  "Sinch",
  "Trustly",
  "Epidemic Sound",
  "King",
  "DICE",
  "Försäkringskassan",
  "Skatteverket",
  "Arbetsförmedlingen",
  "Migrationsverket",
  "Polismyndigheten",
  "Kriminalvården",
  "Trafikverket",
  "Lantmäteriet",
  "Bolagsverket",
  "Tullverket",
  "CSN",
  "Pensionsmyndigheten",
  "Region Stockholm",
  "Region Skåne",
  "Region Halland",
  "Sahlgrenska",
  "Karolinska",
  "Akademiska sjukhuset",
  "Lunds universitet",
  "Chalmers",
  "Folkuniversitetet",
  "Byggfirman AB",
  "Nordbygg AB",
  "Café Lugnet",
  "Länsförsäkringar",
  "Folksam",
  "Trygg-Hansa",
  "Hedvig",
  "Capio",
  "Aleris",
  "DB Schenker",
  "DHL",
  "Norrtälje kommun",
  "Lidingö stad",
  // v5.1: news-domain orgs to lift ORG recall. Curated to DISTINCTIVE names
  // only: no bare 2-3 letter acronyms (EU, FN, LO, SVT, KTH) and no common
  // words (Investor, Stadium, Kicks), which made v5 over-fire and tank precision.
  // sports clubs
  "AIK",
  "Hammarby IF",
  "Djurgården",
  "IFK Göteborg",
  "Malmö FF",
  "IF Elfsborg",
  "BK Häcken",
  "Frölunda HC",
  "Färjestad BK",
  "Brynäs IF",
  "Skellefteå AIK",
  "Leksands IF",
  "Luleå Hockey",
  "Kalmar FF",
  // political parties
  "Socialdemokraterna",
  "Moderaterna",
  "Sverigedemokraterna",
  "Centerpartiet",
  "Vänsterpartiet",
  "Liberalerna",
  "Kristdemokraterna",
  "Miljöpartiet",
  // agencies (distinctive compound names only)
  "Riksbanken",
  "Konkurrensverket",
  "Livsmedelsverket",
  "Folkhälsomyndigheten",
  "Socialstyrelsen",
  "Energimyndigheten",
  "Skolverket",
  "Kronofogden",
  "Säkerhetspolisen",
  "Försvarsmakten",
  "Naturvårdsverket",
  // unions / employer orgs
  "Kommunal",
  "IF Metall",
  "Unionen",
  "Svenskt Näringsliv",
  "Lärarförbundet",
  "Vårdförbundet",
  // media (distinctive titles, not the SVT/TV4/TT acronyms)
  "Aftonbladet",
  "Expressen",
  "Dagens Nyheter",
  "Svenska Dagbladet",
  "Göteborgs-Posten",
  "Sydsvenskan",
  "Dagens Industri",
  // more Swedish companies (distinctive names)
  "AstraZeneca",
  "Saab",
  "SSAB",
  "Boliden",
  "Husqvarna",
  "Alfa Laval",
  "Assa Abloy",
  "Nordea",
  "Avanza",
  "Stena Line",
  "Telenor",
  "Tele2",
  // universities
  "Stockholms universitet",
  "Göteborgs universitet",
  "Umeå universitet",
  "Karolinska Institutet",
  "Linnéuniversitetet",
  // other
  "Svenska kyrkan",
  "Skandia",
  "Folktandvården",
]

// --- entity builders ----------------------------------------------------
const hyphenFirst = () =>
  `${pick(FIRST)}-${pick(["Erik", "Marie", "Britt", "Olof", "Lena", "Gustaf", "Louise"])}`
const person = () => {
  const r = rand()
  if (r < 0.12) return pick(FIRST)
  if (r < 0.22) return `${hyphenFirst()} ${pick(LAST)}`
  if (r < 0.3) return `${pick(FIRST)} ${pick(LAST)}-${pick(LAST)}`
  return `${pick(FIRST)} ${pick(LAST)}`
}
const FOREIGN = [
  "Oslo",
  "Köpenhamn",
  "Helsingfors",
  "Reykjavik",
  "Berlin",
  "London",
  "Bryssel",
  "Tallinn",
]
const place = () => {
  const r = rand()
  if (r < 0.5) return pick(CITIES)
  if (r < 0.8) return pick(DISTRICTS)
  return pick(FOREIGN)
}
const address = () =>
  `${pick(STREET_STEMS)}${pick(STREET_SUFFIX)} ${1 + Math.floor(rand() * 119)}${chance(0.25) ? pick(["A", "B", "C", "D"]) : ""}`
// Institutions are organisations too — composed names the model kept missing.
const INSTITUTION = () => {
  const r = rand()
  if (r < 0.25) return `${pick(CITIES)} lasarett`
  if (r < 0.45) return `${pick(CITIES)} kommun`
  if (r < 0.6)
    return `Region ${pick(["Skåne", "Halland", "Stockholm", "Värmland", "Dalarna", "Jämtland", "Uppsala"])}`
  if (r < 0.75) return `${pick(STREET_STEMS)}gårdens äldreboende`
  if (r < 0.88) return `${pick(CITIES)} universitet`
  return `${pick(STREET_STEMS)}skolan`
}
const org = () => (chance(0.3) ? INSTITUTION() : pick(ORGS))

// Genitive forms ("Annas bil", "Volvos fabrik") are still entity tokens, but
// v4 never saw them and dropped the whole entity. Swedish genitive appends
// "s" with no apostrophe; names already ending in s/x/z stay bare.
const genitive = (name) => (/[sxz]$/i.test(name) ? name : `${name}s`)
// v9: full-name share up from 0.5; v5 still dropped capitalized "Anna Karlssons".
const personGenitive = () => genitive(chance(0.35) ? pick(FIRST) : `${pick(FIRST)} ${pick(LAST)}`)
const orgGenitive = () => genitive(pick(ORGS))

const SLOTS = {
  PER: person,
  LOC: place,
  ORG: org,
  ADR: address,
  PERG: personGenitive,
  ORGG: orgGenitive,
}
// Slot name -> BIO tag type, for slots that are surface variants of a base type.
const SLOT_TAG = { PERG: "PER", ORGG: "ORG" }
const TEMPLATES = [
  "Patient {PER} inkom akut med bröstsmärta.",
  "Remiss för {PER} skickas till {ORG} i {LOC}.",
  "Sjuksköterskan {PER} noterade att {PER} mår bättre.",
  "{PER} är inskriven på {ORG} sedan i måndags.",
  "Vårdnadshavare {PER} kontaktades om barnet {PER}.",
  "Läkaren {PER} på {ORG} ordinerade vila.",
  "Klienten {PER} företräds av advokat {PER}.",
  "Tvisten står mellan {PER} och {ORG}.",
  "Domaren {PER} ajournerade förhandlingen till torsdag.",
  "Ombudet {PER} begärde uppskov i målet mot {ORG}.",
  "Enligt {PER} hade {ORG} brutit mot avtalet.",
  "Min granne {PER} på {ADR} behöver hjälp.",
  "{PER} bor i lägenheten på {ADR} i {LOC}.",
  "Felanmälan från {PER}, {ADR}, gäller en vattenläcka.",
  "Hyresgästen på {ADR} heter {PER}.",
  "Fastigheten på {ADR} i {LOC} såldes i somras.",
  "Kandidaten {PER} har tidigare arbetat på {ORG}.",
  "{PER} söker tjänsten som projektledare på {ORG}.",
  "Anställd {PER} slutar på {ORG} i {LOC} sista juni.",
  "Referensen {PER} bekräftade uppgifterna.",
  "Rekryteraren {PER} intervjuade {PER} i fredags.",
  "Kunden {PER} klagade på leveransen från {ORG}.",
  "{PER} hörde av sig om ett trasigt paket från {ORG}.",
  "Ärendet öppnades av {PER} på {ORG}.",
  "Återkoppla till {PER} angående beställningen.",
  "Ansökan om bistånd avser {PER}, boende på {ADR}.",
  "Handläggaren {PER} bedömde ärendet för {PER}.",
  "{ORG} beviljade stöd till familjen {PER}.",
  "Beslutet expedierades till {PER} på {ADR}, {LOC}.",
  "Försäkringstagare {PER} anmälde en skada i {LOC}.",
  "{ORG} avslog ersättningskravet från {PER}.",
  "Skadeanmälan från {PER} gäller bilen.",
  "Ny kund: {PER}, bosatt på {ADR}.",
  "{PER} öppnade ett sparkonto hos {ORG}.",
  "Överföringen från {PER} granskades av {ORG}.",
  "Eleven {PER} i klass 8B har hög frånvaro.",
  "Rektorn {PER} tillträder på {ORG} i {LOC}.",
  "Läraren {PER} rapporterade frånvaro för {PER}.",
  "Rapport: {PER} på {ADR} saknar dricksvatten.",
  "{PER} i {LOC} behöver insulin inom sex timmar.",
  "Polisen söker {PER}, senast sedd i {LOC}.",
  "Den misstänkte {PER} greps nära {ADR}.",
  "{PER} uppgav att hen jobbar på {ORG}.",
  "Chauffören {PER} körde lasten till {LOC}.",
  "Leveransen till {ADR} hanteras av {ORG}.",
  "Konsulten {PER} fakturerade {ORG} för uppdraget.",
  "{PER} flyttade från {LOC} till {ADR}.",
  "Brevet adresserades till {PER}, {ADR}, {LOC}.",
  "Mötet hölls på {ORG} med {PER} och {PER}.",
  "{ORG} har anställt {PER} som ny chef i {LOC}.",
  "I {LOC} träffade {PER} sin handläggare {PER}.",
  "Det var {PER} som skrev under, inte {PER}.",
  "Tillsammans med {PER} besökte hon {ORG} i {LOC}.",
  "Hör av dig till {PER} så ordnar {ORG} resten.",
  "På {ADR} bor numera {PER}.",
  "Enligt journalen flyttade {PER} till {LOC}.",
  "Vd:n {PER} presenterade siffrorna för styrelsen.",
  "Bouppteckningen efter {PER} förrättades av {ORG}.",
  "Tolken {PER} hjälpte {PER} under mötet.",
  "{PER} och {PER} delar lägenhet på {ADR}.",
  "Verkstaden {ORG} reparerade bilen åt {PER}.",
  "Mormor {PER} bodde länge på {ADR} i {LOC}.",
  "Utredaren {PER} från {ORG} intervjuade personalen.",
  "Frakten sköts av {ORG} från terminalen i {LOC}.",
  "Kontoret ligger på {ADR}, men posten går till boxen.",
  "{PER}, som arbetar på {ORG}, bekräftade beslutet.",
  "Vet du om {PER} fortfarande bor i {LOC}?",
  "kan någon ringa {PER} på {ORG}?",
  "är det {PER} eller {PER} som ansvarar?",
  "hörde att {PER} börjat på {ORG}.",
  "Närvarande: {PER}, {PER} och {PER}.",
  "Avsändare: {PER}, {ADR}, {LOC}.",
  "Kontaktperson {PER} ({ORG}).",
  "Ärendet behandlas inom fem arbetsdagar.",
  "Vänligen återkom med kompletterande uppgifter.",
  "Beslutet kan överklagas inom tre veckor.",
  "Tack för att du kontaktade vår kundtjänst.",
  "Mötet är inbokat till nästa torsdag klockan fjorton.",
  "Bifoga gärna relevanta dokument till ansökan.",
  "Vi behandlar din förfrågan så snart som möjligt.",
  "Fakturan förfaller den sista i månaden.",
  "Observera att kontoret är stängt över helgen.",
  "Handläggningstiden är för närvarande cirka två veckor.",
  "Det regnade hela dagen och tåget var försenat.",
  "En björn sågs i skogen utanför byn i tisdags.",
  // number distractors — digit groups are NOT addresses/entities
  "Beloppet 12 345 kr betalades i tid.",
  "Ring 070-123 45 67 vid frågor.",
  "Referensnummer 2024-1187 noterades i akten.",
  "Summan 1 299 kronor drogs felaktigt.",
  "Fakturanummer 5567 och 8890 är betalda.",
  "Klockan 14 30 öppnar receptionen.",
  "Avtalet löper i 24 månader från start.",
  // org in subject position (fights org-as-name confusion)
  "{ORG} meddelade ett driftstopp i natt.",
  "Enligt {ORG} är leveranserna försenade.",
  "{ORG} och {ORG} ingick ett samarbete.",
  "Det var {ORG}, inte {ORG}, som skickade fakturan.",
  "Beställningen från {ORG} kom aldrig fram.",
  "Vi bytte leverantör från {ORG} till {ORG}.",
  // common non-PII acronyms/terms — must NOT be tagged as ORG (all O)
  "Sätt in EKG-svar och CRP i journalen.",
  "Patienten genomgick MR och CT på avdelningen.",
  "Bifoga ditt CV som PDF till ansökan.",
  "Ange IBAN och BIC för betalningen.",
  "Kontrollera moms och OCR på fakturan.",
  "VAB-ansökan skickas digitalt med BankID.",
  "Vi följer GDPR och loggar inget i vårt API.",
  "BMI och blodtryck noterades vid besöket.",
  "Betala med Swish eller ange OCR-nummer.",
  "ROT- och RUT-avdrag dras automatiskt.",
  "Frågor och svar finns under FAQ på sidan.",
  "Hör av dig till HR eller IT vid problem.",
  // v5.1: a few ORG-in-news contexts (sports/politics/general). Kept to 3, not
  // 10, so ORG density doesn't spike and drag precision down.
  "{ORG} vann mot {ORG} med 3-1 i går.",
  "{ORG} presenterade sitt budgetförslag i riksdagen.",
  "{PER} lämnar {ORG} efter flera år som ordförande.",
  // v8: hard negatives from demo false positives: the v5 model tagged the bare
  // role/contact/payment word in name position as PER/ORG ("Kund" and "Mail"
  // as PER at ~1.0, "maila" as PER, "bankgiro" as ORG). The word before the
  // name, the label-colon prefix and the payment rail must all stay O.
  "Kund {PER} hör av sig om en försenad leverans.",
  "Kund {PER} ringde och ville makulera ordern.",
  "Patient {PER} inkom med bröstsmärta i natt.",
  "Klient {PER} yrkar skadestånd mot {ORG}.",
  "Sambo {PER} är arbetssökande sedan i våras.",
  "Anhörig (maken {PER}) nås på telefon dagtid.",
  "Referens: {PER}, nås via växeln.",
  "Mail: svar skickas inom två arbetsdagar.",
  "Mail: se kontaktuppgifter i bilagan.",
  "Sätt in provsvaren i journalen och maila sammanfattningen.",
  "Kan du maila {PER} på {ORG} om mötet?",
  "Glöm inte att mejla protokollet till styrelsen.",
  "Betalning sker till bankgiro 5051-6905 senast förfallodagen.",
  "Ange bankgiro eller plusgiro på fakturan.",
  "Beloppet dras från ditt konto den 25:e varje månad.",
  // v9: casing/chat round. Stress testing v5 found: capitalized full-name
  // genitive dropped ("Anna Karlssons journal"), bare lowercase first name
  // mid-chat leaked ("det är fatima igen"), ALL CAPS names leaked, and chat
  // greetings ("tjena", "hejhej") were tagged as PER.
  "{PERG} journal ska uppdateras efter besöket.",
  "{PERG} ansökan beviljades i onsdags.",
  "{PERG} leverans är försenad igen.",
  "{PERG} ärende avslutas vid månadsskiftet.",
  "tjena, det är {PER} igen, har ni hittat mitt paket?",
  "hejhej {PER} här, jag ringde igår om fakturan.",
  "hej det är {PER} från {ORG}, återkommer om offerten.",
  "det är {PER} igen, tredje gången jag hör av mig nu.",
  "tjena, kan ni hjälpa mig med en faktura?",
  "hejhej, ville bara kolla status på mitt ärende.",
  "yo, funkar swish-betalningen igen eller?",
  "Ring {PER} omgående om leveransen.",
  "KONTAKTA {PER} INNAN FREDAG.",
  // v7: genitive entities, which a stress test showed v4 dropped entirely.
  "{PERG} bil står felparkerad utanför {ADR}.",
  "Det är {PERG} ansvar att meddela {ORG}.",
  "{PERG} journal uppdaterades av {PER}.",
  "Har du sett {PERG} nya lägenhet i {LOC}?",
  "{PERG} chef på {ORG} godkände semestern.",
  "{ORGG} kontor i {LOC} stänger vid årsskiftet.",
  "Paketet skickades med {ORGG} egen budfirma.",
]

function tokenizeFiller(str) {
  const out = []
  for (const raw of str.trim().split(/\s+/)) {
    if (!raw) continue
    const m = raw.match(/^([^\wÅÄÖåäö]*)(.*?)([^\wÅÄÖåäö]*)$/u)
    const [, pre, core, post] = m
    if (pre) for (const c of pre) out.push(c)
    if (core) out.push(core)
    if (post) for (const c of post) out.push(c)
  }
  return out
}

function buildExample() {
  const template = pick(TEMPLATES)
  const tokens = []
  const tags = []
  for (const part of template.split(/(\{[A-Z]+\})/)) {
    const slot = part.match(/^\{([A-Z]+)\}$/)
    if (slot) {
      const name = slot[1]
      const type = SLOT_TAG[name] ?? name
      SLOTS[name]()
        .split(/\s+/)
        .forEach((w, idx) => {
          tokens.push(w)
          tags.push(`${idx === 0 ? "B" : "I"}-${type}`)
        })
    } else if (part) {
      for (const t of tokenizeFiller(part)) {
        tokens.push(t)
        tags.push("O")
      }
    }
  }
  // light augmentation for robustness
  if (tokens.length) {
    // v7 casing augmentation: chat users type all-lowercase (and sometimes
    // ALL CAPS), and v4 collapsed on both. Whole-sentence variants teach the
    // model to rely on context, not capitalisation, for entity cues.
    const r = rand()
    // v9: lowercase 0.12 -> 0.16, caps 0.03 -> 0.05 (chat/caps leaks in v5).
    if (r < 0.16) {
      for (let k = 0; k < tokens.length; k++) tokens[k] = tokens[k].toLowerCase()
    } else if (r < 0.21) {
      for (let k = 0; k < tokens.length; k++) tokens[k] = tokens[k].toUpperCase()
    } else if (chance(0.2) && tags[0] === "O") {
      tokens[0] = tokens[0].toLowerCase()
    }
    if (chance(0.25) && /^[.!?]$/.test(tokens[tokens.length - 1])) {
      tokens.pop()
      tags.pop()
    }
  }
  return { tokens, tags }
}

const trainCount = Number(process.argv[2] ?? 24000)
const valCount = Number(process.argv[3] ?? 2000)

function writeSet(path, n) {
  const lines = []
  for (let i = 0; i < n; i++) lines.push(JSON.stringify(buildExample()))
  writeFileSync(path, `${lines.join("\n")}\n`)
}

const dir = new URL("./data/", import.meta.url)
writeSet(new URL("train.jsonl", dir), trainCount)
writeSet(new URL("val.jsonl", dir), valCount)

const sample = buildExample()
console.log(`Wrote ${trainCount} train + ${valCount} val examples`)
console.log(
  `Gazetteers: ${FIRST.length} first, ${LAST.length} last, ${CITIES.length} cities, ${ORGS.length} orgs, ${TEMPLATES.length} templates`,
)
console.log("Sample:", sample.tokens.join(" "))
