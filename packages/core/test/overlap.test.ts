import { describe, expect, it } from "vitest"
import { redact } from "../src/index"

/**
 * The structured-identifier regexes deliberately overlap: a personnummer, a
 * bankgiro, a plusgiro and a postnummer can all match overlapping digit runs.
 * `redact` resolves this with "earliest start wins, then longest match". These
 * fixtures pin down *who wins* on the genuinely ambiguous inputs, because a
 * silent change in precedence is exactly the kind of regression that leaks PII
 * or mangles a legitimate number.
 */

/** Helper: the labels assigned, in order of appearance. */
function labelsOf(input: string): string[] {
  return redact(input).redactions.map((r) => r.label)
}

describe("overlap resolution between structured identifiers", () => {
  it("a full IBAN wins over the postnummer hiding inside it", () => {
    const { text, redactions } = redact("Betala till SE45 5000 0000 0583 9825 7466 idag.")
    expect(text).toContain("[IBAN_1]")
    expect(text).not.toContain("[POSTNUMMER")
    expect(redactions).toHaveLength(1)
    expect(redactions[0]?.label).toBe("IBAN")
  })

  it("a valid personnummer wins over a bankgiro-shaped substring", () => {
    // 900101-2385 is a valid personnummer; the engine must not split it.
    const labels = labelsOf("Mitt personnummer är 900101-2385.")
    expect(labels).toContain("PERSONNUMMER")
    expect(labels).not.toContain("BANKGIRO")
  })

  it("an organisationsnummer is preferred over the personnummer pattern when valid", () => {
    // 556036-0793 is a valid orgnr (third digit >= 2), not a valid personnummer.
    const labels = labelsOf("Leverantör 556036-0793 fakturerar.")
    expect(labels).toContain("ORGANISATIONSNUMMER")
    expect(labels).not.toContain("PERSONNUMMER")
  })

  it("does not double-redact: each character belongs to at most one placeholder", () => {
    const input = "Anna (900101-2385) bankgiro 5050-1055 mejl anna@x.se ringer 070-123 45 67."
    const { redactions } = redact(input)
    // Sort by start and assert no two spans overlap.
    const spans = redactions.map((r) => [r.start, r.end] as const).sort((a, b) => a[0] - b[0])
    for (let i = 1; i < spans.length; i++) {
      const prevEnd = spans[i - 1]?.[1] ?? 0
      const curStart = spans[i]?.[0] ?? 0
      expect(curStart, `span ${i} overlaps the previous one`).toBeGreaterThanOrEqual(prevEnd)
    }
  })

  it("a postnummer is still caught when standing alone (no longer match steals it)", () => {
    const labels = labelsOf("Skicka till 114 51 Stockholm.")
    expect(labels).toContain("POSTNUMMER")
  })

  it("redacts a dense mix without dropping any of the high-value identifiers", () => {
    const input =
      "Personnummer 900101-2385, org 556036-0793, IBAN SE4550000000058398257466, kort 4111 1111 1111 1111."
    const labels = new Set(labelsOf(input))
    expect(labels).toContain("PERSONNUMMER")
    expect(labels).toContain("ORGANISATIONSNUMMER")
    expect(labels).toContain("IBAN")
    expect(labels).toContain("KORTNUMMER")
  })
})
