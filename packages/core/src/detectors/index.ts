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

// åäö in both parts: addresses like "åsa.öberg@example.se" exist in the wild,
// and a leading \b would never match before "å" (JS \b is ASCII-only).
export const email = regexDetector("EMAIL", /[A-ZÅÄÖ0-9._%+-]+@[A-ZÅÄÖ0-9.-]+\.[A-Z]{2,}\b/gi)

/**
 * Swedish phone numbers: +46 / 0 prefix, mobile and landline. The consumed
 * left guard (capture group carries the value) stops the match from starting
 * inside a longer digit run like "kundnummer 100200-3000".
 */
export const phone = regexDetector(
  "PHONE",
  /(?:^|[^\d])((?:\+46[\s-]?|0)(?:7[02369]|[1-9]\d?)(?:[\s-]?\d){6,8})\b/g,
)

/** Postnummer: NNN NN (space optional). */
export const postnummer = regexDetector("POSTNUMMER", /\b\d{3}\s?\d{2}\b/g)

// --- Payment identifiers --------------------------------------------------

/**
 * Bankgiro: NNN-NNNN or NNNN-NNNN, with a mod-10 (Luhn) check digit. The
 * checksum is what separates a real bankgiro from look-alikes such as a year
 * range ("2019-2024") or an arbitrary reference id.
 */
export const bankgiro = regexDetector("BANKGIRO", /\b\d{3,4}-\d{4}\b/g, (v) =>
  luhnValid(v.replace(/\D/g, "")),
)

/**
 * Plusgiro: 1-7 digits, dash, single check digit, commonly written with
 * space groups ("90 19 50-6"). The whole number carries a mod-10 (Luhn)
 * check digit, which filters out look-alikes like list numbering ("punkt 1-2").
 */
export const plusgiro = regexDetector("PLUSGIRO", /\b\d(?:\s?\d){0,6}-\d\b/g, (v) =>
  luhnValid(v.replace(/\D/g, "")),
)

/** Swedish IBAN: SE + 22 digits (spaces tolerated). */
export const iban = regexDetector("IBAN", /\bSE\d{2}(?:\s?\d){20}\b/gi)

// --- Generic / international ----------------------------------------------

// Anchored on a digit at both ends so the captured value can't include a
// trailing space or dash (the old `(?:\d[ -]?){13,19}` swallowed the separator).
export const creditCard = regexDetector("CREDIT_CARD", /\b\d(?:[ -]?\d){12,18}\b/g, (v) => {
  const digits = v.replace(/\D/g, "")
  return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
})

export const ipAddress = regexDetector(
  "IP_ADDRESS",
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
)

export const url = regexDetector("URL", /\bhttps?:\/\/[^\s<>")]+/gi)

// --- Heuristic Swedish detectors (opt-in) ----------------------------------
//
// Format-based like `phone` and `postnummer`, but with no checksum to validate
// against, so they carry a higher false-positive risk than the defaults. They
// are deliberately NOT part of `defaultDetectors`: add them explicitly via
// `heuristicDetectors` when free-text addresses and plates matter more than
// the occasional over-redaction.

/**
 * Swedish street address: "Sankt Eriksgatan 12B", "Storvägen 3". Three case
 * shapes on purpose: chat text writes "björkvägen 21" and forms write
 * "STORGATAN 12", and an NER model that only catches the street name would
 * leave the house number exposed. The two-word prefix ("Sankt", "Norra")
 * requires a capital so it never swallows a preceding "på"/"till". The
 * consumed left guard replaces \b, which never matches before Å/Ä/Ö (JS \b
 * is ASCII-only), so "Östgötagatan 15" works too.
 */
export const adress = regexDetector(
  "ADRESS",
  /(?:^|[^A-Za-zÅÄÖåäö0-9])((?:(?:[A-ZÅÄÖ][a-zåäö]+\s)?[A-ZÅÄÖa-zåäö][a-zåäö]*(?:gatan|vägen|gränd|gränden|torget|stigen|backen|allén|plan|gata|väg)|[A-ZÅÄÖ]+(?:GATAN|VÄGEN|GRÄND|GRÄNDEN|TORGET|STIGEN|BACKEN|ALLÉN|PLAN|GATA|VÄG))\s?\d{1,3}[A-Za-z]?)\b/g,
)

/** Apartment number: "lgh 1203", "lägenhet 42". */
export const lagenhetsnummer = regexDetector(
  "LAGENHETSNUMMER",
  /\b(?:lgh|lägenhet)\.?\s?\d{2,4}\b/gi,
)

// Amounts like "SEK 100" share the plate shape; rejecting currency codes is
// cheaper than false-positive redactions in every invoice.
const CURRENCY_CODES = new Set(["SEK", "USD", "EUR", "NOK", "DKK", "GBP", "CHF", "JPY", "ISK"])

/**
 * Swedish car registration plate: "ABC 123", "ABC12D". The letter set matches
 * what Transportstyrelsen actually issues (no I, Q, V, Å, Ä, Ö), which also
 * filters out most acronym look-alikes.
 */
export const regnummer = regexDetector(
  "REGNUMMER",
  /\b[A-HJ-PR-UW-Z]{3}\s?\d{2}[A-HJ-PR-UW-Z0-9]\b/g,
  (v) => !CURRENCY_CODES.has(v.slice(0, 3)),
)

/**
 * The opt-in heuristics as one bundle:
 * `redact(text, { detectors: [...defaultDetectors, ...heuristicDetectors] })`.
 */
export const heuristicDetectors: Detector[] = [adress, lagenhetsnummer, regnummer]

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
