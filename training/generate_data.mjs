/**
 * Synthetic Swedish PII training data generator.
 *
 * Emits word-level, BIO-tagged token-classification examples as JSONL:
 *   {"tokens": ["Patient","Anna","Karlsson",...], "tags": ["O","B-PER","I-PER",...]}
 *
 * We only teach the model the FREE-TEXT entities a rule layer can't reliably
 * catch — names, places, organisations, free addresses. Structured PII
 * (personnummer, org-nr, phone, IBAN…) stays with @maska/core's detectors.
 *
 * Usage: node training/generate_data.mjs [trainCount] [valCount]
 */
import { writeFileSync } from "node:fs"

// --- deterministic RNG so runs are reproducible -------------------------
let seed = 1337
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const chance = (p) => rand() < p

// --- gazetteers ---------------------------------------------------------
const FIRST = [
  "Anna", "Lars", "Erik", "Maria", "Johan", "Sara", "Björn", "Astrid", "Karin",
  "Per", "Eva", "Nils", "Lena", "Anders", "Margareta", "Sven", "Elsa", "Oskar",
  "Greta", "Ingrid", "Gustav", "Linnéa", "Emil", "Stina", "Olof", "Hanna",
  "Mattias", "Sofia", "Daniel", "Emma", "Henrik", "Klara", "Fredrik", "Alice",
  "Jonas", "Wilma", "Andreas", "Maja", "Markus", "Ebba", "Pär", "Agnes", "Ali",
  "Ahmed", "Fatima", "Mohammed", "Aisha", "Hassan", "Leila", "Yusuf", "Omar",
  "Sofia", "Ivan", "Aleksandra", "Mehmet", "Zara", "Amir", "Nora", "Elias",
  "Liam", "Astrid", "Hugo", "Selma", "Vera", "Ludvig", "Tuva", "Folke", "Signe",
  "Börje", "Gunilla", "Ronny", "Siv", "Bengt", "Ulla", "Kjell", "Maj", "Tore",
]
const LAST = [
  "Karlsson", "Eriksson", "Andersson", "Johansson", "Nilsson", "Larsson",
  "Persson", "Svensson", "Gustafsson", "Pettersson", "Jonsson", "Jansson",
  "Hansson", "Bengtsson", "Lindberg", "Lindström", "Lindqvist", "Lindgren",
  "Berg", "Bergström", "Lundberg", "Lundqvist", "Lundgren", "Berggren",
  "Sandberg", "Holmberg", "Nyström", "Holm", "Öberg", "Wikström", "Isaksson",
  "Fredriksson", "Bergman", "Forsberg", "Sjöberg", "Ek", "Dahl", "Al-Rashid",
  "Hassan", "Yilmaz", "Demir", "Nowak", "Ahmadi", "Khan", "Söderberg", "Blom",
]
const CITIES = [
  "Stockholm", "Göteborg", "Malmö", "Uppsala", "Västerås", "Örebro", "Linköping",
  "Helsingborg", "Jönköping", "Norrköping", "Lund", "Umeå", "Gävle", "Borås",
  "Eskilstuna", "Södertälje", "Karlstad", "Täby", "Växjö", "Halmstad", "Sundsvall",
  "Luleå", "Trollhättan", "Östersund", "Borlänge", "Falun", "Kalmar", "Kristianstad",
  "Skövde", "Karlskrona", "Visby", "Kiruna", "Ystad", "Sigtuna", "Mariestad",
]
const DISTRICTS = [
  "Kungsholmen", "Södermalm", "Östermalm", "Vasastan", "Norrmalm", "Gamla stan",
  "Hammarby Sjöstad", "Solna", "Sundbyberg", "Nacka", "Hisingen", "Majorna",
  "Möllevången", "Limhamn", "Gottsunda", "Rosengård", "Bergsjön", "Husby",
]
const STREET_STEMS = [
  "Stor", "Lill", "Norr", "Söder", "Öster", "Väster", "Kyrk", "Skol", "Park",
  "Berg", "Sjö", "Strand", "Ängs", "Björk", "Ek", "Gran", "Linde", "Ros",
  "Kungs", "Drottning", "Vasa", "Sankt Erik", "Karla", "Odengatan-", "Industri",
  "Hamn", "Torg", "Brunns", "Markna", "Köpman",
]
const STREET_SUFFIX = ["gatan", "vägen", "gränd", "stigen", "torget", "backen", "allén"]
const ORGS = [
  "Volvo", "Ericsson", "Spotify", "IKEA", "H&M", "Scania", "Skanska", "Telia",
  "Klarna", "SEB", "Swedbank", "Handelsbanken", "ICA", "Coop", "Systembolaget",
  "Vattenfall", "Sandvik", "Atlas Copco", "Electrolux", "SKF", "Securitas",
  "Försäkringskassan", "Skatteverket", "Arbetsförmedlingen", "Migrationsverket",
  "Region Stockholm", "Polismyndigheten", "Kriminalvården", "Trafikverket",
  "Byggfirman AB", "Nordbygg AB", "Konsult & Partner AB", "Café Lugnet",
  "Restaurang Sjöboden", "Lindex", "Apoteket", "Postnord", "SAS", "SJ",
]

// --- entity builders ----------------------------------------------------
const person = () =>
  chance(0.85) ? `${pick(FIRST)} ${pick(LAST)}` : pick(FIRST)
const place = () => (chance(0.5) ? pick(CITIES) : pick(DISTRICTS))
const address = () => `${pick(STREET_STEMS)}${pick(STREET_SUFFIX)} ${1 + Math.floor(rand() * 89)}${chance(0.3) ? pick(["A", "B", "C"]) : ""}`
const org = () => pick(ORGS)

// --- templates: parts are strings (filler) or slot markers --------------
const SLOTS = { PER: person, LOC: place, ORG: org, ADR: address }
const TEMPLATES = [
  "Patient {PER} inkom akut med bröstsmärta.",
  "Hej, jag heter {PER} och bor på {ADR} i {LOC}.",
  "Klienten {PER} företräds av advokat {PER}.",
  "Ärendet gäller {PER}, boende i {LOC}.",
  "Min granne {PER} på {ADR} behöver hjälp.",
  "Kandidaten {PER} har tidigare arbetat på {ORG}.",
  "{PER} ringde från {LOC} angående sitt ärende.",
  "Vi skickade fakturan till {PER} på {ADR}.",
  "Anställd {PER} slutar sin tjänst på {ORG} i {LOC}.",
  "Vårdnadshavare {PER} kontaktades om eleven {PER}.",
  "Försäkringstagare {PER} anmälde en skada i {LOC}.",
  "Mötet hölls på {ORG} med {PER} och {PER}.",
  "{PER} flyttade från {LOC} till {ADR}.",
  "Handläggaren {PER} bedömde ansökan från {PER}.",
  "Familjen {PER} bor på {ADR}, {LOC}.",
  "Kunden {PER} klagade på leveransen från {ORG}.",
  "Rapport: {PER} på {ADR} saknar dricksvatten.",
  "Enligt {PER} hade {ORG} brutit mot avtalet.",
  "Sjuksköterskan {PER} noterade att {PER} mår bättre.",
  "{ORG} har anställt {PER} som ny chef i {LOC}.",
  "Brevet adresserades till {PER}, {ADR}, {LOC}.",
  "Lärare {PER} rapporterade frånvaro för {PER}.",
  "Polisen sökte {PER} senast sedd i {LOC}.",
  "Konsulten {PER} fakturerade {ORG} för uppdraget.",
  "Boende {PER} på {ADR} anmälde en vattenläcka.",
  // negative / no-entity fillers
  "Ärendet behandlas inom fem arbetsdagar.",
  "Vänligen återkom med kompletterande uppgifter.",
  "Beslutet kan överklagas inom tre veckor.",
  "Tack för att du kontaktade vår kundtjänst.",
  "Mötet är inbokat till nästa torsdag klockan fjorton.",
  "Bifoga gärna relevanta dokument till ansökan.",
  "Vi behandlar din förfrågan så snart som möjligt.",
]

// --- tokenizer for filler text: split words, peel punctuation -----------
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
  // split template into filler and {SLOT} segments
  const parts = template.split(/(\{[A-Z]+\})/)
  for (const part of parts) {
    const slot = part.match(/^\{([A-Z]+)\}$/)
    if (slot) {
      const type = slot[1]
      const value = SLOTS[type]()
      const words = value.split(/\s+/)
      words.forEach((w, idx) => {
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
  return { tokens, tags }
}

// --- main ---------------------------------------------------------------
const trainCount = Number(process.argv[2] ?? 9000)
const valCount = Number(process.argv[3] ?? 1000)

function writeSet(path, n) {
  const lines = []
  for (let i = 0; i < n; i++) lines.push(JSON.stringify(buildExample()))
  writeFileSync(path, `${lines.join("\n")}\n`)
}

const dir = new URL("./data/", import.meta.url)
writeSet(new URL("train.jsonl", dir), trainCount)
writeSet(new URL("val.jsonl", dir), valCount)

// quick stats
const sample = buildExample()
console.log(`Wrote ${trainCount} train + ${valCount} val examples to training/data/`)
console.log("Sample:")
console.log("  tokens:", sample.tokens.join(" "))
console.log("  tags:  ", sample.tags.join(" "))
console.log("Labels: O, B/I-PER, B/I-LOC, B/I-ORG, B/I-ADR")
