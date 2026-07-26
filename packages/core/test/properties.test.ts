import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { redact } from "../src/index"

/**
 * Property-based tests. Instead of hand-picking examples we describe *invariants*
 * that must hold for every input, and let fast-check hunt for counter-examples.
 *
 * Inputs are built by interleaving random bracket-free "filler" prose with real
 * PII values drawn from a pool. Bracket-free filler matters: placeholder tokens
 * look like `[EPOST_1]`, so by keeping `[`/`]` out of the surrounding text we
 * guarantee a token can never collide with untouched prose, which is the only
 * way round-trip restoration could legitimately fail.
 */

// A pool of valid, synthetic PII values (Luhn-checked where relevant).
const PII_POOL = [
  "900101-2385", // personnummer
  "202100-4748", // organisationsnummer
  "anna@example.com", // email
  "070-174 06 58", // phone
  "SE4280000890119146168423", // IBAN
  "4242 4242 4242 4242", // credit card (Stripe test value)
  "192.0.2.1", // IP (IANA TEST-NET-1)
  "https://example.com/path", // URL
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

/**
 * The same invariants, but over inputs built from characters chosen to break
 * the canonical-view offset mapping: invisible formatting, compatibility digits
 * and letters, ligatures that fold to more characters than they occupy,
 * combining marks, and lone separators. Ordinary text takes an identity fast
 * path through `canonicalize`, so only a generator like this exercises the
 * segment map at all, and a mapping bug there is a mis-masked span: the wrong
 * text redacted and the real value left in the clear.
 */
const hostileChars = [
  "​", // zero width space
  "­", // soft hyphen
  "⁠", // word joiner
  "﻿", // BOM
  " ", // narrow no-break space
  " ", // thin space
  " ", // no-break space
  "͏", // combining grapheme joiner
  "̊", // combining ring above
  "‮", // right-to-left override
  "ﬁ", // ligature fi -> two characters
  "㎐", // squared unit -> three characters
  "①", // circled digit one
  "…", // ellipsis -> three dots
  "０",
  "５",
  "８",
  "＠", // fullwidth 0, 5, 8, @
  ..."0123456789 \t\n-+.@ASÅåÖ",
]

const hostileDocumentArb = fc
  .array(fc.constantFrom(...hostileChars), { maxLength: 80 })
  .map((chars) => chars.join(""))

describe("canonical-view invariants", () => {
  it("keeps every detection anchored to real text, and round-trips", () => {
    fc.assert(
      fc.property(hostileDocumentArb, (input) => {
        const result = redact(input)
        // restore() must reproduce the original bytes, folding and all.
        expect(result.restore(result.text)).toBe(input)
        let previousEnd = 0
        for (const detection of result.redactions) {
          // A span must describe the text it claims to describe. If the offset
          // map drifted, this is where it shows up.
          expect(input.slice(detection.start, detection.end)).toBe(detection.value)
          expect(detection.start).toBeGreaterThanOrEqual(previousEnd)
          expect(detection.end).toBeLessThanOrEqual(input.length)
          previousEnd = detection.end
        }
      }),
      { numRuns: 20000 },
    )
  })

  it("never leaves a redacted value in the output", () => {
    fc.assert(
      fc.property(hostileDocumentArb, (input) => {
        const result = redact(input)
        for (const detection of result.redactions) {
          if (detection.value.length > 3) expect(result.text).not.toContain(detection.value)
        }
      }),
      { numRuns: 20000 },
    )
  })
})
