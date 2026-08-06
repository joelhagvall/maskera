/**
 * Fail-closed privacy guard for task-specific NER training rows.
 *
 * The NER layer does not need live structured identifiers. Reject a complete
 * row whenever it contains a value that could route to, authenticate, or
 * identify a real person/account/device. Task-specific model training has no
 * reason to contain even reserved examples of structured identifiers;
 * detector tests live in the rule package instead.
 *
 * Callers must not print matched values: diagnostics expose categories only.
 */
import { isIP } from "node:net"

const unique = (items) => [...new Set(items)]

function addMatches(issues, text, pattern, kind) {
  for (const match of text.matchAll(pattern)) {
    issues.push(kind)
  }
}

/** Return privacy issue categories only; never return matched values. */
export function trainingPrivacyIssues(tokens) {
  if (!Array.isArray(tokens) || tokens.some((token) => typeof token !== "string")) {
    return ["invalid-token-array"]
  }

  const text = tokens.join(" ")
  const issues = []

  // IBANs are unnecessary for NER supervision. Reject even checksum-invalid
  // IBAN-shaped values: a transcription error can still describe a real
  // account and must not be treated as anonymous.
  addMatches(issues, text, /\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi, "iban-or-account")

  addMatches(issues, text, /[A-ZÅÄÖ0-9._%+-]+@[A-ZÅÄÖ0-9.-]+\.[A-Z]{2,}\b/gi, "email")
  if (/(?:^|\s)@[A-ZÅÄÖ0-9_]{2,}\b/iu.test(text)) issues.push("account-handle")

  addMatches(issues, text, /\b(?:https?:\/\/|www\.)\S+/gi, "url")
  addMatches(
    issues,
    text,
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    "ip-address",
  )
  for (const token of tokens) {
    const candidate = token.replace(/^[([{<"']+|[\])}>"',.;]+$/g, "")
    if (isIP(candidate) === 6) issues.push("ip-address")
  }
  addMatches(
    issues,
    text,
    /\b(?:bc1|[13])[A-HJ-NP-Za-km-z0-9]{25,62}\b|\b0x[0-9a-f]{40}\b/gi,
    "wallet-address",
  )
  addMatches(
    issues,
    text,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    "record-identifier",
  )
  addMatches(issues, text, /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi, "device-identifier")

  // Swedish vehicle registrations can identify an owner through registry
  // lookups. They add nothing to free-text NER supervision.
  addMatches(
    issues,
    text,
    /(?<![\p{L}\p{N}])[A-ZÅÄÖ]{3}\s?[0-9]{2}[0-9A-Z](?![\p{L}\p{N}])/giu,
    "vehicle-identifier",
  )

  // Swedish personal/co-ordination/organisation number shapes.
  addMatches(
    issues,
    text,
    /\b(?:(?:19|20)\d{6}[-+]?\d{4}|\d{6}[-+]?\d{4}|16\d{10})\b/g,
    "identity-number",
  )

  const protectedNumericSpans = [
    ...text.matchAll(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]){11,30}\b/gi),
    ...text.matchAll(/\b(?:(?:19|20)\d{6}[-+]?\d{4}|\d{6}[-+]?\d{4}|16\d{10})\b/g),
  ].map((match) => [match.index, match.index + match[0].length])

  const phonePattern =
    /(?:^|[^\d])((?:\+46[\s-]?(?:\(0\)[\s-]?)?|0)(?:7[02369]|[1-9]\d?)(?:[\s-]?\d){6,8})\b/g
  const phoneSpans = []
  for (const match of text.matchAll(phonePattern)) {
    const value = match[1]
    const start = match.index + match[0].indexOf(value)
    const end = start + value.length
    phoneSpans.push([start, end])
    if (protectedNumericSpans.some(([lo, hi]) => lo < end && hi > start)) continue
    issues.push("phone-number")
  }

  // Luhn-valid long numbers can be card/account identifiers. Irrespective of
  // checksum, numeric runs of seven or more digits are rejected.
  addMatches(issues, text, /\b\d(?:[ -]?\d){6,18}\b/g, "long-number")

  // A labelled payment field followed by a shorter number is still linkable
  // even when it is not long enough for the generic account pattern.
  const paymentNumberPattern =
    /\b(?:bankgiro|plusgiro|kontonummer|konto|ocr)\b[^\n]{0,24}?\b\d(?:[ -]?\d){4,18}\b/gi
  addMatches(issues, text, paymentNumberPattern, "payment-identifier")
  addMatches(
    issues,
    text,
    /\b(?:SWIFT|BIC)\b\s*[:=]?\s+\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
    "payment-identifier",
  )

  // Postal codes can turn an otherwise generic street mention into a precise
  // real-world address. The synthetic ADR generator does not need them.
  for (const match of text.matchAll(/\b(?:[1-9]\d{2}\s?\d{2})\b/g)) {
    const end = match.index + match[0].length
    if (phoneSpans.some(([lo, hi]) => lo < end && hi > match.index)) continue
    issues.push("postal-code")
  }

  return unique(issues)
}

export function assertTrainingRowPrivacy(tokens, where) {
  const issues = trainingPrivacyIssues(tokens)
  if (issues.length) {
    throw new Error(`${where}: prohibited training identifier category: ${issues.join(", ")}`)
  }
}

const SYNTHETIC_ADDRESS_MARKER =
  /(?:masker|provdata|provper|provbyn|provstrand|provtext|fiktiv|exempeldata|syntet|test|dataskyddstest|nollpost)/iu

/**
 * Require every BIO address span to carry an explicit synthetic marker.
 * Diagnostics intentionally omit the address value.
 */
export function assertSyntheticAddressSpans(tokens, tags, where) {
  if (!Array.isArray(tokens) || !Array.isArray(tags) || tokens.length !== tags.length) {
    throw new Error(`${where}: invalid tokens/tags for synthetic-address audit`)
  }

  for (let index = 0; index < tags.length; index++) {
    if (tags[index] !== "B-ADR") continue
    const span = [tokens[index]]
    let cursor = index + 1
    while (cursor < tags.length && tags[cursor] === "I-ADR") {
      span.push(tokens[cursor])
      cursor++
    }
    if (!SYNTHETIC_ADDRESS_MARKER.test(span.join(" "))) {
      throw new Error(`${where}: address span lacks an explicit synthetic marker`)
    }
    index = cursor - 1
  }
}
