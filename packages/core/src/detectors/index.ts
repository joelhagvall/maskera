import type { Detection, Detector, PiiLabel } from "../types"
import {
  isOrganisationsnummer,
  isPersonnummer,
  isSamordningsnummer,
  luhnValid,
} from "../validators"

type RawMatch = Omit<Detection, "label">

/**
 * Build a detector from a global regex, with an optional `validate` predicate
 * that can reject false positives (e.g. a number that fails a checksum).
 */
export function regexDetector(
  label: PiiLabel,
  regex: RegExp,
  validate?: (value: string) => boolean,
): Detector {
  if (!regex.global) {
    throw new Error(`Detector "${label}" requires a global ("g") regex`)
  }
  return {
    label,
    detect(input: string): RawMatch[] {
      const out: RawMatch[] = []
      regex.lastIndex = 0
      for (const m of input.matchAll(regex)) {
        if (m.index === undefined) continue
        // If the pattern uses a capture group for the actual value, prefer it.
        const value = m[1] ?? m[0]
        if (value.length === 0) continue
        const start = m.index + m[0].indexOf(value)
        if (validate && !validate(value)) continue
        out.push({ start, end: start + value.length, value })
      }
      return out
    },
  }
}

// --- Swedish structured identifiers --------------------------------------

/** Personnummer: YYYYMMDD-XXXX / YYMMDD-XXXX, `-` or `+` separator optional. */
export const personnummer = regexDetector(
  "PERSONNUMMER",
  /\b(?:19|20)?\d{6}[-+]?\d{4}\b/g,
  isPersonnummer,
)

/** Samordningsnummer: personnummer-shaped but with day + 60. */
export const samordningsnummer = regexDetector(
  "SAMORDNINGSNUMMER",
  /\b(?:19|20)?\d{6}[-+]?\d{4}\b/g,
  isSamordningsnummer,
)

/** Organisationsnummer: NNNNNN-NNNN, Luhn-checked, third digit >= 2. */
export const organisationsnummer = regexDetector(
  "ORGANISATIONSNUMMER",
  /\b\d{6}[-]?\d{4}\b/g,
  isOrganisationsnummer,
)

// --- Contact details ------------------------------------------------------

export const email = regexDetector("EMAIL", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)

/** Swedish phone numbers: +46 / 0 prefix, mobile and landline. */
export const phone = regexDetector(
  "PHONE",
  /(?:\+46[\s-]?|0)(?:7[02369]|[1-9]\d?)(?:[\s-]?\d){6,8}\b/g,
)

/** Postnummer: NNN NN (space optional). */
export const postnummer = regexDetector("POSTNUMMER", /\b\d{3}\s?\d{2}\b/g)

// --- Payment identifiers --------------------------------------------------

/** Bankgiro: NNN-NNNN or NNNN-NNNN. */
export const bankgiro = regexDetector("BANKGIRO", /\b\d{3,4}-\d{4}\b/g)

/** Plusgiro: N..N-N (1-7 digits, dash, single check digit). */
export const plusgiro = regexDetector("PLUSGIRO", /\b\d{1,7}-\d\b/g)

/** Swedish IBAN: SE + 22 digits (spaces tolerated). */
export const iban = regexDetector("IBAN", /\bSE\d{2}(?:\s?\d){20}\b/gi)

// --- Generic / international ----------------------------------------------

export const creditCard = regexDetector("CREDIT_CARD", /\b(?:\d[ -]?){13,19}\b/g, (v) => {
  const digits = v.replace(/\D/g, "")
  return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
})

export const ipAddress = regexDetector(
  "IP_ADDRESS",
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
)

export const url = regexDetector("URL", /\bhttps?:\/\/[^\s<>")]+/gi)

/**
 * Default detector set, ordered so that the most specific / highest-confidence
 * detectors run first. Overlap resolution keeps the longest, earliest match.
 */
export const defaultDetectors: Detector[] = [
  email,
  url,
  personnummer,
  samordningsnummer,
  organisationsnummer,
  iban,
  creditCard,
  bankgiro,
  plusgiro,
  phone,
  postnummer,
  ipAddress,
]
