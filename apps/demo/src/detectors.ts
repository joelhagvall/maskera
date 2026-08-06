import {
  contextualDetectors,
  type Detector,
  defaultDetectors,
  heuristicDetectors,
  regexDetector,
} from "@maskera/core"

/**
 * The demo runs maskera's hybrid defaults (core's structured detectors +
 * contextual account numbers + adress + lägenhetsnummer) with `regnummer`
 * added on top, i.e.
 * what an npm user gets with `[...hybridDefaultDetectors, regnummer]`. The
 * only demo-only detector is the name gazetteer below: in production
 * free-text names come from maskera's model, but here it lets the demo
 * redact names instantly while the model is still downloading.
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
  "Amir",
  "Jonas",
  "Elin",
  "Kent",
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
  "Haddad",
  "Ahmadi",
  "Wikström",
  "Bergman",
]

// The gazetteer must stay case-sensitive: lowercase "berg", "ek" and "per"
// are ordinary Swedish words. The ALL CAPS complaint scenario instead gets
// exact uppercase entries, so the off-state demo masks it too.
const UPPERCASE_NAMES = ["KENT PERSSON", "KENT"]

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Full names first (longest match wins), then standalone first/last names.
const fullNames = FIRST_NAMES.flatMap((f) => LAST_NAMES.map((l) => `${f} ${l}`))
const nameAlternation = [...fullNames, ...FIRST_NAMES, ...LAST_NAMES, ...UPPERCASE_NAMES]
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join("|")

// \b is ASCII-only: it misses standalone "Öberg" (no boundary before Ö) and
// matches "Berg" inside "Bergåsen". Unicode lookarounds treat åäö as letters.
export const namn: Detector = regexDetector(
  "NAMN",
  new RegExp(`(?<!\\p{L})(${nameAlternation})(?!\\p{L})`, "gu"),
)

/**
 * Off-state (no model): rules + the offline name gazetteer, so the demo still
 * redacts names instantly with zero download.
 */
export const demoDetectors: Detector[] = [
  namn,
  ...contextualDetectors,
  ...heuristicDetectors,
  ...defaultDetectors,
]

/**
 * Model-state: drop the name gazetteer: the Swedish NER model handles names,
 * places and orgs. We keep the rule detectors, because the model is *worse*
 * at anything with a fixed shape: personnummer/org-nr/phone/IBAN
 * (format-aware rules with selective checksums) and street addresses with house numbers, where the model
 * can split the span and leave the number exposed. Rules win on overlap, so
 * the regex address always covers the full "Påhittsgatan 12".
 * This is the hybrid: rules for structured shapes, model for free text.
 */
export const ruleDetectors: Detector[] = [
  ...contextualDetectors,
  ...heuristicDetectors,
  ...defaultDetectors,
]
