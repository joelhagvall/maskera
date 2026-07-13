import {
  isOrganisationsnummer,
  isPersonnummer,
  isSamordningsnummer,
  type Redaction,
} from "@maskera/core"

/**
 * Personnummer-shaped strings that the validators rejected (bad Luhn digit or
 * impossible date part). People trying the demo almost always type a made-up
 * number, see it pass through untouched and conclude the redaction missed,
 * when it is really the checksum doing its job. The demo surfaces these so
 * the output card can say why they were left alone.
 *
 * The separator is required here even though the real detector treats it as
 * optional: a bare 10-digit run that fails the checksum is usually an order
 * or customer number, not an attempted personnummer, and hinting on those
 * would cry wolf.
 */
const PNR_SHAPE = /\b(?:19|20)?\d{6}[-+]\d{4}\b/g

export function invalidPersonnummer(text: string, redactions: Redaction[]): string[] {
  const out: string[] = []
  for (const m of text.matchAll(PNR_SHAPE)) {
    const value = m[0]
    if (isPersonnummer(value) || isSamordningsnummer(value) || isOrganisationsnummer(value))
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
