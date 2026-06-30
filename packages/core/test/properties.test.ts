import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { redact } from "../src/index"

/**
 * Property-based tests. Instead of hand-picking examples we describe *invariants*
 * that must hold for every input, and let fast-check hunt for counter-examples.
 *
 * Inputs are built by interleaving random bracket-free "filler" prose with real
 * PII values drawn from a pool. Bracket-free filler matters: placeholder tokens
 * look like `[EMAIL_1]`, so by keeping `[`/`]` out of the surrounding text we
 * guarantee a token can never collide with untouched prose, which is the only
 * way round-trip restoration could legitimately fail.
 */

// A pool of valid, synthetic PII values (Luhn-checked where relevant).
const PII_POOL = [
  "900101-0017", // personnummer
  "556036-0793", // organisationsnummer
  "anna@example.se", // email
  "070-123 45 67", // phone
  "SE4550000000058398257466", // IBAN
  "4111 1111 1111 1111", // credit card (valid Luhn)
  "192.168.0.1", // IP
  "https://example.se/path", // URL
]

// Filler made only of letters and spaces, never produces brackets or digits,
// so it can't accidentally form a placeholder token or a new PII match.
const fillerArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzåäöABCDEFGHIJKLMNOPQRST   "), {
    maxLength: 40,
  })
  .map((chars) => chars.join(""))

const piiArb = fc.constantFrom(...PII_POOL)

// A document is an alternating sequence of filler and PII fragments.
const documentArb = fc
  .array(fc.tuple(fillerArb, piiArb), { maxLength: 8 })
  .map((pairs) => `${pairs.map(([f, p]) => `${f} ${p} `).join("")}slut.`)

describe("redact invariants", () => {
  it("round-trips: restore(redact(x)) === x", () => {
    fc.assert(
      fc.property(documentArb, (input) => {
        const { text, restore } = redact(input)
        expect(restore(text)).toBe(input)
      }),
    )
  })

  it("never leaks: no injected PII value survives verbatim in the output", () => {
    fc.assert(
      fc.property(fc.array(piiArb, { minLength: 1, maxLength: 6 }), fillerArb, (pii, filler) => {
        const input = pii.map((p) => `${filler} ${p}`).join(" och ")
        const { text } = redact(input)
        for (const value of pii) {
          expect(text, `leaked "${value}"`).not.toContain(value)
        }
      }),
    )
  })

  it("is deterministic: same input yields identical output", () => {
    fc.assert(
      fc.property(documentArb, (input) => {
        const a = redact(input)
        const b = redact(input)
        expect(a.text).toBe(b.text)
        expect(a.map).toEqual(b.map)
      }),
    )
  })

  it("produces non-overlapping redaction spans for any input", () => {
    fc.assert(
      fc.property(documentArb, (input) => {
        const spans = redact(input)
          .redactions.map((r) => [r.start, r.end] as const)
          .sort((a, b) => a[0] - b[0])
        for (let i = 1; i < spans.length; i++) {
          expect((spans[i]?.[0] ?? 0) >= (spans[i - 1]?.[1] ?? 0)).toBe(true)
        }
      }),
    )
  })

  it("repeated identical values share one placeholder and one map entry", () => {
    fc.assert(
      fc.property(piiArb, fc.integer({ min: 2, max: 5 }), (value, n) => {
        const input = Array.from({ length: n }, () => value).join(" , ")
        const { text, map } = redact(input)
        const tokens = text.match(/\[[A-Z_]+_\d+\]/g) ?? []
        expect(tokens).toHaveLength(n)
        expect(new Set(tokens).size).toBe(1) // all the same token
        expect(Object.keys(map)).toHaveLength(1)
      }),
    )
  })

  it("never throws and always returns a string for arbitrary unicode input", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const { text } = redact(input)
        expect(typeof text).toBe("string")
      }),
    )
  })
})
