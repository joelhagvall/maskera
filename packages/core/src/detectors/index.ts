import type { Detection, Detector, PiiLabel } from "../types"
import {
  isOrganisationsnummer,
  isPersonnummerShape,
  isSamordningsnummerShape,
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
  // Match indices ("d") give the capture group's real position. Looking the
  // group text up inside m[0] instead (`m[0].indexOf(value)`) finds its first
  // *occurrence*, which is a different place whenever that text also appears
  // earlier in the match: a custom detector like /kontakt (\S+) mejl \1/ then
  // reports a span four characters too far left, and redact() masks the wrong
  // slice and leaves the value itself in the clear. The built-in detectors all
  // capture at an unambiguous position, but this is public API.
  //
  // The flag is added to a copy, which also keeps `lastIndex` off the caller's
  // regex. Engines predating the flag (it needs Chrome 90 / Safari 15 / Node
  // 16) throw on construction, and these detectors are built at module scope,
  // so the fallback is what keeps `import` itself from failing there.
  let scanner = regex
  let hasIndices = regex.flags.includes("d")
  if (!hasIndices) {
    try {
      scanner = new RegExp(regex.source, `${regex.flags}d`)
      hasIndices = true
    } catch {
      scanner = regex
    }
  }
  return {
    label,
    detect(input: string): RawMatch[] {
      const out: RawMatch[] = []
      for (const m of input.matchAll(scanner)) {
        if (m.index === undefined) continue
        // If the pattern uses a capture group for the actual value, prefer it.
        const group = m[1] !== undefined ? 1 : 0
        const value = m[group] as string
        if (value.length === 0) continue
        const span = hasIndices ? (m as MatchWithIndices).indices?.[group] : undefined
        const start = span ? span[0] : m.index + m[0].indexOf(value)
        if (validate && !validate(value)) continue
        out.push({ start, end: start + value.length, value })
      }
      return out
    },
  }
}

/** `RegExpMatchArray.indices` is ES2022; the package compiles against ES2021. */
type MatchWithIndices = RegExpMatchArray & {
  indices?: Array<[number, number] | undefined>
}

// --- Swedish structured identifiers --------------------------------------

/**
 * A maximal run of digits, plus the `-`/`+` a Swedish identifier may contain
 * and the horizontal whitespace it is routinely typed with ("811218 9876",
 * "19 811218 9876" in forms and journal notes). Stopping the run at a space
 * made one space a reliable one-character bypass, the same failure the missing
 * word boundary was fixed for. Newlines are NOT included, so two numbers in a
 * column never merge, and the whitespace run is bounded so the pattern cannot
 * backtrack over a long gap.
 *
 * The class names U+1680 OGHAM SPACE MARK explicitly: it is the one horizontal
 * whitespace NFKC does not fold to U+0020 (canonicalize folds the rest, so the
 * plain space covers them), yet it matches JS `\s` and renders as a space, so
 * without it a single character split the run and walked a personnummer past
 * the checksum detectors.
 */
const DIGIT_RUN = /\d(?:[\d+-]|[ \t\u00a0\u1680]{1,2}(?=\d))*\d|\d/g

const isDigit = (code: number) => code >= 48 && code <= 57
const WS = /\s/

/**
 * Find identifiers by sliding a window over every digit run, with no
 * word-boundary requirement at all.
 *
 * `\b` is what a caller uses to slip PII past the filter: appending a single
 * digit to a personnummer took detection from 100% to 0%, reliably, and that is
 * a poor property for the most sensitive identifier Sweden has. The boundary is
 * only load-bearing because a bare digit run is usually an order id, so the
 * format check has to carry that weight instead. It can, but only where the
 * format is selective enough: personnummer and samordningsnummer constrain
 * month and day, which rejects ~96% of candidates on its own.
 *
 * Note that personnummer and samordningsnummer deliberately validate on the
 * DATE SHAPE ONLY (isPersonnummerShape), not on the Luhn control digit: in
 * real customer data people mistype their own number, and rejecting on Luhn
 * leaks the very identifier this filter exists to protect. The date check
 * carries the precision burden instead. Measured on 20,000 sentences of
 * number-dense Swedish business text containing no personal identifiers,
 * dropping the boundary costs 0.4 false positives per 100 sentences against
 * 0.1 for the boundary version; the Luhn-free policy spends a little more of
 * that same budget on typo-shaped numbers that happen to parse as dates.
 *
 * Organisationsnummer (only "third digit >= 2" plus Luhn) and card numbers (only
 * Luhn) are NOT scanned this way: they fire on ~10% of window positions, which
 * measured at 10 false positives per 100 sentences. They keep their boundaries
 * and their checksums.
 *
 * A run may contain whitespace ("811218 9876"), but a window is only allowed to
 * cross it at the position the separator actually belongs, four digits from the
 * end. Anything else would let two unrelated numbers in a table ("Belopp 4711
 * 220345") fuse into a candidate, and it is the cheap check that keeps the
 * widened run from spending the false-positive budget the format checks bought.
 *
 * Widths are tried widest-first and a match consumes its window, so a 12-digit
 * form is never also reported as the 10-digit form hiding inside it.
 */
function checksumWindowDetector(
  label: PiiLabel,
  widths: readonly number[],
  validate: (digits: string) => boolean,
): Detector {
  return {
    label,
    detect(input: string): RawMatch[] {
      const out: RawMatch[] = []
      DIGIT_RUN.lastIndex = 0
      for (const run of input.matchAll(DIGIT_RUN)) {
        const text = run[0]
        const base = run.index
        if (base === undefined) continue
        // Absolute offset of each digit, so a separator inside the run stays
        // inside the reported span. `spaced[k]` records that whitespace sits
        // between digit k-1 and digit k.
        const offsets: number[] = []
        const spaced: boolean[] = []
        let digits = ""
        let gapSpaced = false
        let anySpaced = false
        for (let i = 0; i < text.length; i++) {
          if (isDigit(text.charCodeAt(i))) {
            offsets.push(base + i)
            spaced.push(gapSpaced)
            digits += text[i]
            gapSpaced = false
          } else if (WS.test(text[i] as string)) {
            gapSpaced = true
            anySpaced = true
          }
        }
        let i = 0
        while (i < digits.length) {
          let width = 0
          for (const w of widths) {
            if (i + w > digits.length) continue
            // Whitespace may only sit where the identifier's own separator
            // does: four digits from the end of the window.
            if (anySpaced) {
              let ok = true
              for (let k = i + 1; k < i + w; k++) {
                if (spaced[k] && k !== i + w - 4) {
                  ok = false
                  break
                }
              }
              if (!ok) continue
            }
            if (!validate(digits.slice(i, i + w))) continue
            width = w
            break
          }
          if (width === 0) {
            i++
            continue
          }
          const start = offsets[i] as number
          const end = (offsets[i + width - 1] as number) + 1
          out.push({ start, end, value: input.slice(start, end) })
          i += width
        }
      }
      return out
    },
  }
}

/**
 * Personnummer: YYYYMMDD-XXXX / YYMMDD-XXXX, `-` or `+` separator optional.
 * Validates on date shape only, NOT Luhn: a mistyped control digit is the most
 * common way a real personnummer appears in customer data, and rejecting it
 * leaks exactly what we are here to mask (see isPersonnummerShape).
 */
export const personnummer = checksumWindowDetector("PERSONNUMMER", [12, 10], isPersonnummerShape)

/** Samordningsnummer: personnummer-shaped but with day + 60. Same no-Luhn policy. */
export const samordningsnummer = checksumWindowDetector(
  "SAMORDNINGSNUMMER",
  [12, 10],
  isSamordningsnummerShape,
)

/** Organisationsnummer: NNNNNN-NNNN, Luhn-checked, third digit >= 2. */
export const organisationsnummer = regexDetector(
  "ORGANISATIONSNUMMER",
  /\b\d{6}[-]?\d{4}\b/g,
  isOrganisationsnummer,
)

// --- Contact details ------------------------------------------------------

// Letters in both parts are ANY Unicode letter/number, not [A-ZÅÄÖ0-9]:
// addresses like "andré@example.com" and "anna@münchen.se" exist in the wild,
// and a diacritic or confusable (Cyrillic "а") sitting next to the @ or in the
// domain used to leave no match position at all, walking the whole address
// past the filter while rendering like an ordinary address. A leading \b is
// still impossible (JS \b is ASCII-only), which is why there is none.
//
// The quantifiers are bounded to the RFC 5321 maxima (local part 64 octets,
// domain 255, DNS label 63) rather than left open. Not for validation: it caps
// backtracking. `[\p{L}\p{N}._%+-]+@` is quadratic on any long unbroken run of
// those characters, because every start position consumes the whole run and
// then backs out one char at a time looking for an `@` that isn't there. A
// hex digest, a base64url blob or a JWT segment is exactly such a run
// (base64url's `-` and `_` are both in the class), so a 250 KB paste took ~57 s
// on the unbounded pattern and ~30 ms bounded. Ordinary prose never noticed,
// which is precisely why this could sit here unseen.
export const email = regexDetector(
  "EPOST",
  /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}.-]{1,255}\.\p{L}{2,63}\b/giu,
)

/**
 * Phone numbers. Swedish: +46 / 0 prefix, mobile and landline, including the
 * e-mail-signature style "+46(0)70-174 06 58" where the trunk zero rides
 * along in parentheses. International: a `+<1-3 digit country code>` prefix
 * followed by 6-12 digits with optional spaces/dashes ("+33 6 12 34 56 78",
 * "+47 9123456"). The `+` is required for the international form — without
 * it a bare digit run is far more often an order id or account number than a
 * foreign phone number, so the unprefixed branch stays Swedish-only.
 * The consumed left guard (capture group carries the value) stops the match
 * from starting inside a longer digit run like "kundnummer TEST-100200-3000".
 */
export const phone = regexDetector(
  "TELEFON",
  /(?:^|[^\d])((?:\+46[\s-]?(?:\(0\)[\s-]?)?|0)(?:7[02369]|[1-9]\d?)(?:[\s-]?\d){6,8}|\+\d{1,3}(?:[\s-]?\d){6,12})\b/g,
)

/**
 * Postnummer: NNN NN. The spaced form is distinctive enough to match on its
 * own. The compact 5-digit form only matches with context: followed by a
 * capitalized word ("12345 Staden") or preceded by an SE- prefix, because
 * a bare digit run is far more often an order id, case number or price than a
 * postal code, and masking those as POSTNUMMER over-redacts everyday text.
 * Swedish postal codes never start with 0.
 */
export const postnummer = regexDetector(
  "POSTNUMMER",
  /\b[1-9]\d{2}\s\d{2}\b|\b[1-9]\d{4}\b(?=\s+[A-ZÅÄÖ])|(?<=\bSE-?)[1-9]\d{2}\s?\d{2}\b/g,
)

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
 * Plusgiro: 2-7 digits, dash, single check digit, commonly written with
 * space groups ("92 01 00-5"). The whole number carries a mod-10 (Luhn)
 * check digit, which filters out look-alikes like list numbering ("punkt 1-2").
 * A single-digit body is deliberately NOT matched: ~1 in 9 digit-dash-digit
 * pairs in running text is Luhn-valid by chance ("3-4", "6-7", match scores,
 * page ranges), which over-masks far more than the vanishingly rare
 * one-digit plusgiro accounts protect.
 */
export const plusgiro = regexDetector("PLUSGIRO", /\b\d(?:\s?\d){1,6}-\d\b/g, (v) =>
  luhnValid(v.replace(/\D/g, "")),
)

/** Swedish IBAN: SE + 22 digits (spaces tolerated). */
export const iban = regexDetector("IBAN", /\bSE\d{2}(?:\s?\d){20}\b/gi)

// --- Generic / international ----------------------------------------------

// Anchored on a digit at both ends so the captured value can't include a
// trailing space or dash (the old `(?:\d[ -]?){13,19}` swallowed the separator).
export const creditCard = regexDetector("KORTNUMMER", /\b\d(?:[ -]?\d){12,18}\b/g, (v) => {
  const digits = v.replace(/\D/g, "")
  return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
})

export const ipAddress = regexDetector(
  "IP_ADRESS",
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
)

// Scheme-less `www.` hosts are matched too: they are everywhere in email
// signatures ("www.foretaget.se") and leak the organisation if left in place.
// Bare domains without either signal ("example.com") are deliberately NOT
// guessed at: that would over-mask ordinary filenames and abbreviations.
// The final character class refuses sentence punctuation, so "se www.x.se."
// keeps its full stop outside the mask (mid-URL dots still match; only a
// trailing run of `.,;:!?` is backtracked off).
export const url = regexDetector("URL", /\b(?:https?:\/\/|www\.)[^\s<>")]*[^\s<>").,;:!?]/gi)

// --- Heuristic Swedish detectors (opt-in) ----------------------------------
//
// Format-based like `phone` and `postnummer`, but with no checksum to validate
// against, so they carry a higher false-positive risk than the defaults. They
// are deliberately NOT part of `defaultDetectors`: add them explicitly via
// `heuristicDetectors` when free-text addresses and plates matter more than
// the occasional over-redaction.

/**
 * Swedish street address: "Påhittsgatan 12B", "Maskeravägen 3". Three case
 * shapes on purpose: chat text writes "påhittsvägen 21" and forms write
 * "PÅHITTSGATAN 12", and an NER model that only catches the street name would
 * leave the house number exposed. The two-word prefix ("Sankt", "Norra")
 * requires a capital so it never swallows a preceding "på"/"till". The
 * consumed left guard replaces \b, which never matches before Å/Ä/Ö (JS \b
 * is ASCII-only), so "Maskeragränd 15" works too.
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
