import { type Redaction, redact } from "@maskera/core"
import { describe, expect, it } from "vitest"
import { invalidPersonnummer } from "../src/hints"

/**
 * Table-driven tests for the demo's checksum hint. The fixtures were derived
 * by running the core validators, not by hand: 19900101-2385 and 700178-2395
 * are official Skatteverket test identifiers, and 202100-4748 is the
 * organisationsnummer from Skatteverket's Navet test certificate.
 * The hint must fire ONLY for pnr-shaped strings that no validator accepts and
 * no other detector already masks.
 */

const none: Redaction[] = []

describe("invalidPersonnummer: valid identifiers are never hinted", () => {
  const valid = [
    ["12-digit personnummer", "pnr 19900101-2385 finns"],
    ["10-digit personnummer", "pnr 900101-2385 finns"],
    ["plus separator (100+ years)", "född 19000101+9801"],
    ["samordningsnummer (day+60)", "sam 700178-2395 ok"],
    ["organisationsnummer (Navet test)", "kommunen 202100-4748 äger"],
  ] as const

  for (const [name, text] of valid) {
    it(name, () => {
      expect(invalidPersonnummer(text, none)).toEqual([])
    })
  }
})

describe("invalidPersonnummer: invalid pnr-shaped strings are hinted", () => {
  const invalid = [
    ["12-digit, checksum off by one", "pnr 19900101-2384 här", "19900101-2384"],
    ["10-digit, random checksum", "pnr 900101-1234 här", "900101-1234"],
    ["impossible month 13", "pnr 19901301-2385 här", "19901301-2385"],
    ["impossible date feb 30", "pnr 20250230-1234 här", "20250230-1234"],
    ["plus separator, bad checksum", "född 19000101+2385", "19000101+2385"],
    ["start of text", "19900101-2384 inleder", "19900101-2384"],
    ["end of text", "avslutas med 19900101-2384", "19900101-2384"],
    ["followed by punctuation", "numret (19900101-2384).", "19900101-2384"],
  ] as const

  for (const [name, text, expected] of invalid) {
    it(name, () => {
      expect(invalidPersonnummer(text, none)).toEqual([expected])
    })
  }
})

describe("invalidPersonnummer: shapes outside the hint's remit", () => {
  const skipped = [
    ["bare 10 digits, no separator", "ordernummer TEST-9001012384 skickad"],
    ["space instead of separator", "pnr 19900101 2385 kanske"],
    ["too few digits before separator", "id 90011-2384 nej"],
    ["too many digits after separator", "ref 900101-23845 nej"],
    ["digits glued to a word", "fakturaX900101-1234Y rad"],
    ["empty text", ""],
    ["no digits at all", "bara vanlig text utan nummer"],
  ] as const

  for (const [name, text] of skipped) {
    it(name, () => {
      expect(invalidPersonnummer(text, none)).toEqual([])
    })
  }
})

describe("invalidPersonnummer: aggregation", () => {
  it("deduplicates repeated occurrences", () => {
    const text = "först 19900101-2384 och sen 19900101-2384 igen"
    expect(invalidPersonnummer(text, none)).toEqual(["19900101-2384"])
  })

  it("returns distinct hits in text order", () => {
    const text = "a 900101-1234 b 19901301-2385 c"
    expect(invalidPersonnummer(text, none)).toEqual(["900101-1234", "19901301-2385"])
  })

  it("hints the invalid number even next to a valid one", () => {
    const text = "giltigt 19900101-2385 ogiltigt 19900101-2384"
    expect(invalidPersonnummer(text, none)).toEqual(["19900101-2384"])
  })
})

describe("invalidPersonnummer: suppression when another detector already masked the span", () => {
  const span = (text: string, value: string): Redaction => {
    const start = text.indexOf(value)
    return { label: "TELEFON", value, start, end: start + value.length, replacement: "[TELEFON_1]" }
  }

  it("fully covered span is suppressed", () => {
    const text = "ring 070174-0658 nu"
    expect(invalidPersonnummer(text, [span(text, "070174-0658")])).toEqual([])
  })

  it("partially overlapping redaction also suppresses", () => {
    const text = "ring 070174-0658 nu"
    const partial = { ...span(text, "070174-0658"), end: text.indexOf("070174-0658") + 6 }
    expect(invalidPersonnummer(text, [partial])).toEqual([])
  })

  it("redaction elsewhere in the text does not suppress", () => {
    const text = "mejl a@example.com och 19900101-2384 kvar"
    const start = text.indexOf("a@example.com")
    const email: Redaction = {
      label: "EPOST",
      value: "a@example.com",
      start,
      end: start + "a@example.com".length,
      replacement: "[EPOST_1]",
    }
    expect(invalidPersonnummer(text, [email])).toEqual(["19900101-2384"])
  })
})

describe("invalidPersonnummer: against the real redact() pipeline", () => {
  it("masks both valid and mistyped date-shaped pnr values", () => {
    const text = "pnr 19900101-2385 och 19900101-2384 klart"
    const result = redact(text)
    expect(result.text).toContain("[PERSONNUMMER_1]")
    expect(result.text).toContain("[PERSONNUMMER_2]")
    expect(invalidPersonnummer(text, result.redactions)).toEqual([])
  })

  it("pnr-shaped phone number is masked as TELEFON and not hinted", () => {
    const text = "ring 070174-0658 nu"
    const result = redact(text)
    expect(result.redactions.map((r) => r.label)).toEqual(["TELEFON"])
    expect(invalidPersonnummer(text, result.redactions)).toEqual([])
  })

  it("clean text yields neither redactions nor hints", () => {
    const text = "hej hur mår du idag"
    const result = redact(text)
    expect(result.redactions).toEqual([])
    expect(invalidPersonnummer(text, result.redactions)).toEqual([])
  })
})
