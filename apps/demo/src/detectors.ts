import { type Detector, defaultDetectors, regexDetector } from "@maskera/core"

/**
 * Demo-only detectors layered on top of @maskera/core's built-ins. They show how
 * trivially maskera extends per domain. In production, free-text names/places
 * would come from maskera — here we use a small offline gazetteer so the
 * demo redacts names instantly with zero model download.
 */

// A modest gazetteer of Swedish names used across the demo scenarios + commons.
const FIRST_NAMES = [
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
  "Ahmed",
  "Fatima",
  "Mohammed",
  "Aisha",
  "Lena",
  "Anders",
  "Margareta",
  "Sven",
  "Elsa",
  "Oskar",
  "Greta",
  "Hassan",
  "Ingrid",
  "Gustav",
  "Linnea",
  "Emil",
  "Stina",
  "Olof",
  "Yusuf",
  "Leila",
]
const LAST_NAMES = [
  "Karlsson",
  "Eriksson",
  "Andersson",
  "Johansson",
  "Nilsson",
  "Larsson",
  "Persson",
  "Svensson",
  "Lindberg",
  "Berg",
  "Lindgren",
  "Holmberg",
  "Al-Rashid",
  "Bergström",
  "Lundqvist",
  "Ek",
  "Sandberg",
  "Öberg",
]

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Full names first (longest match wins), then standalone first/last names.
const fullNames = FIRST_NAMES.flatMap((f) => LAST_NAMES.map((l) => `${f} ${l}`))
const nameAlternation = [...fullNames, ...FIRST_NAMES, ...LAST_NAMES]
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join("|")

export const namn: Detector = regexDetector("NAMN", new RegExp(`\\b(${nameAlternation})\\b`, "g"))

/** Swedish street address: "Sankt Eriksgatan 12B", "Storvägen 3". */
export const adress: Detector = regexDetector(
  "ADRESS",
  /\b(?:[A-ZÅÄÖ][a-zåäö]+\s)?[A-ZÅÄÖ][a-zåäö]*(?:gatan|vägen|gränd|gränden|torget|stigen|backen|allén|plan|gata|väg)\s?\d{1,3}[A-Za-z]?\b/g,
)

/** Apartment number: "lgh 1203", "lägenhet 42". */
export const lagenhetsnummer: Detector = regexDetector(
  "LAGENHETSNUMMER",
  /\b(?:lgh|lägenhet)\.?\s?\d{2,4}\b/gi,
)

/** Swedish car registration plate: ABC 12A / ABC123. */
export const regnummer: Detector = regexDetector("REGNUMMER", /\b[A-Z]{3}\s?\d{2}[A-Z0-9]\b/g)

/**
 * Off-state (no model): rules + the offline name gazetteer, so the demo still
 * redacts names instantly with zero download.
 */
export const demoDetectors: Detector[] = [
  namn,
  adress,
  lagenhetsnummer,
  regnummer,
  ...defaultDetectors,
]

/**
 * Model-state: drop the name gazetteer — the Swedish NER model handles names,
 * places and orgs. We keep the structured rule detectors, because the model
 * is *worse* at anything with a fixed shape: personnummer/org-nr/phone/IBAN
 * (regex+checksum) and street addresses with house numbers, where the model
 * can split the span and leave the number exposed. Rules win on overlap, so
 * the regex address always covers the full "Storgatan 12".
 * This is the hybrid: rules for structured shapes, model for free text.
 */
export const ruleDetectors: Detector[] = [adress, lagenhetsnummer, regnummer, ...defaultDetectors]
