import {
  isOrganisationsnummer,
  isPersonnummerShape,
  isSamordningsnummerShape,
  type Redaction,
} from "@maskera/core"

/**
 * Personnummer-shaped strings that the redaction policy rejects because the
 * date is impossible. A mistyped Luhn digit is deliberately accepted by the
 * detector, so it must never produce this hint. The demo surfaces only values
 * whose date shape is invalid so the output card can explain why they stayed.
 *
 * The separator is required here even though the real detector treats it as
 * optional: a bare 10-digit run with an impossible date is usually an order or
 * customer number, not an attempted personnummer, and hinting on those would
 * cry wolf.
 */
const PNR_SHAPE = /\b(?:19|20)?\d{6}[-+]\d{4}\b/g

export function invalidPersonnummer(text: string, redactions: Redaction[]): string[] {
  const out: string[] = []
  for (const m of text.matchAll(PNR_SHAPE)) {
    const value = m[0]
    if (
      isPersonnummerShape(value) ||
      isSamordningsnummerShape(value) ||
      isOrganisationsnummer(value)
    )
      continue
    const start = m.index
    const end = start + value.length
    // Covered by another detector (phone, bankgiro, IBAN, ...): it IS
    // masked, just under a different label, so there is nothing to explain.
    if (redactions.some((r) => r.start < end && r.end > start)) continue
    if (!out.includes(value)) out.push(value)
  }
  return out
}
