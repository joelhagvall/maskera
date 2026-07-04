import { type Detector, defaultDetectors, heuristicDetectors, regexDetector } from "@maskera/core"

/**
 * The demo runs core's defaults plus its opt-in heuristics (adress,
 * lägenhetsnummer, regnummer), exactly what an npm user gets with
 * `[...defaultDetectors, ...heuristicDetectors]`. The only demo-only detector
 * is the name gazetteer below: in production free-text names come from
 * maskera's model, but here it lets the demo redact names instantly while the
 * model is still downloading.
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

/**
 * Off-state (no model): rules + the offline name gazetteer, so the demo still
 * redacts names instantly with zero download.
 */
export const demoDetectors: Detector[] = [namn, ...heuristicDetectors, ...defaultDetectors]

/**
 * Model-state: drop the name gazetteer — the Swedish NER model handles names,
 * places and orgs. We keep the rule detectors, because the model is *worse*
 * at anything with a fixed shape: personnummer/org-nr/phone/IBAN
 * (regex+checksum) and street addresses with house numbers, where the model
 * can split the span and leave the number exposed. Rules win on overlap, so
 * the regex address always covers the full "Storgatan 12".
 * This is the hybrid: rules for structured shapes, model for free text.
 */
export const ruleDetectors: Detector[] = [...heuristicDetectors, ...defaultDetectors]
