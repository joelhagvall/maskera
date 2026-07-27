import { describe, expect, it } from "vitest"
import { adress, canonicalize, redact } from "../src/index"

/**
 * Detectors match ASCII-ish shapes, so any character that renders as nothing,
 * or renders as a digit without being one, used to be a one-character bypass of
 * the entire rule layer. These are the exact inputs that got through.
 *
 * Skatteverket publishes 850601-2387 as an open test personnummer.
 */
const PNR = "850601-2387"
const ZWSP = "​"
const SHY = "­"
const WJ = "⁠"
const NNBSP = " "
const THIN = " "
const RLO = "‮"

describe("canonicalize", () => {
  it("leaves ordinary text alone and says so", () => {
    const text = "Ring Anna på Maskeragatan 12 i Göteborg."
    const canonical = canonicalize(text)
    expect(canonical.identity).toBe(true)
    expect(canonical.text).toBe(text)
    expect(canonical.span(5, 9)).toEqual([5, 9])
  })

  it("drops invisible characters from the matching view", () => {
    expect(canonicalize(`850601${ZWSP}2387`).text).toBe("8506012387")
    expect(canonicalize(`8506${SHY}012387`).text).toBe("8506012387")
    expect(canonicalize(`850601${WJ}2387`).text).toBe("8506012387")
    expect(canonicalize(`850601${RLO}2387`).text).toBe("8506012387")
  })

  it("drops blank-rendered spaces, enclosing marks and C0/C1 controls", () => {
    // These render as a blank space (or nothing) but are neither \p{Cf} nor
    // folded by NFKC: U+2800 braille blank, U+3164 hangul filler, and the
    // keycap combining mark U+20E3 (\p{Me}).
    expect(canonicalize("850601⠀2387").text).toBe("8506012387")
    expect(canonicalize("850601ㅤ2387").text).toBe("8506012387")
    expect(canonicalize("8⃣5⃣0⃣6⃣0⃣1⃣2⃣3⃣8⃣7⃣").text).toBe("8506012387")
    // The C0/C1 controls are below 0x80, so the printable-ASCII fast path is
    // what must not wave them through; \t \n \f \r stay, as separators.
    expect(canonicalize("850601\u00012387").text).toBe("8506012387")
    expect(canonicalize("850601\u007F2387").text).toBe("8506012387")
    expect(canonicalize("8506012387").text).toBe("8506012387")
    expect(canonicalize("850601\t2387").text).toBe("850601\t2387")
    expect(canonicalize("850601\n2387").text).toBe("850601\n2387")
    expect(canonicalize("850601\f2387").text).toBe("850601\f2387")
  })

  it("folds compatibility digits and typographic spaces", () => {
    expect(canonicalize("８５０６０１２３８７").text).toBe("8506012387")
    expect(canonicalize(`850601${NNBSP}2387`).text).toBe("850601 2387")
    expect(canonicalize(`850601${THIN}2387`).text).toBe("850601 2387")
    expect(canonicalize("850601 2387").text).toBe("850601 2387")
  })

  it("composes a decomposed A-ring so the Swedish character classes match", () => {
    // "Asa" as A + U+030A (combining ring), which is what some PDF extractors
    // and macOS paths produce. JS \b and [A-ZAAO] both fail on it until it is
    // composed, so the address heuristic never fires.
    const decomposed = "A\u030Asagatan 12"
    expect(canonicalize(decomposed).text).toBe("\u00C5sagatan 12")
    const input = `Skicka till ${decomposed} tack.`
    const result = redact(input, { detectors: [adress] })
    expect(result.text).toBe("Skicka till [ADRESS_1] tack.")
    expect(result.restore(result.text)).toBe(input)
  })

  it("maps a span back over an invisible character that sits inside it", () => {
    const input = `Nr ${`850601${ZWSP}2387`} tack`
    const canonical = canonicalize(input)
    const at = canonical.text.indexOf("8506012387")
    const [start, end] = canonical.span(at, at + 10)
    // The span covers the zero-width space, so the mask swallows it.
    expect(input.slice(start, end)).toBe(`850601${ZWSP}2387`)
  })

  it("does not pull a trailing invisible character into the span", () => {
    const input = `${PNR}${ZWSP} tack`
    const canonical = canonicalize(input)
    const [start, end] = canonical.span(0, PNR.length)
    expect(input.slice(start, end)).toBe(PNR)
  })

  it("maps spans correctly when folding changes length", () => {
    // The ligature is one code point that folds to two characters.
    const input = "Mejl: oﬃce@example.com"
    const canonical = canonicalize(input)
    expect(canonical.text).toBe("Mejl: office@example.com")
    const at = canonical.text.indexOf("office@example.com")
    const [start, end] = canonical.span(at, canonical.text.length)
    expect(input.slice(start, end)).toBe("oﬃce@example.com")
  })
})

describe("redact() sees through obfuscation", () => {
  const bypasses: Array<[string, string]> = [
    ["zero width space", `850601${ZWSP}2387`],
    ["soft hyphen (PDF de-hyphenation)", `8506${SHY}012387`],
    ["word joiner", `850601${WJ}2387`],
    ["narrow no-break space (Word)", `850601${NNBSP}2387`],
    ["thin space", `850601${THIN}2387`],
    ["fullwidth digits", "８５０６０１２３８７"],
    ["right-to-left override", `850601${RLO}2387`],
  ]

  for (const [note, value] of bypasses) {
    it(`redacts a personnummer hidden behind ${note}`, () => {
      const input = `Mitt personnummer är ${value}.`
      const result = redact(input)
      expect(result.redactions).toHaveLength(1)
      expect(result.redactions[0]?.label).toBe("PERSONNUMMER")
      expect(result.text).toBe("Mitt personnummer är [PERSONNUMMER_1].")
      // The original characters are what restore() must hand back, byte for byte.
      expect(result.restore(result.text)).toBe(input)
    })
  }

  it("redacts an e-mail split by a zero-width space", () => {
    const input = `Mejla anna.svensson@exa${ZWSP}mple.com idag.`
    const result = redact(input)
    expect(result.text).toBe("Mejla [EPOST_1] idag.")
    expect(result.restore(result.text)).toBe(input)
  })

  it("redacts a whole IBAN rather than half of it as a phone number", () => {
    // Before folding, the zero-width space broke the IBAN apart and the
    // remains matched TELEFON, leaving "SE45 5000 0000" and "66" in the clear.
    const input = `IBAN SE45 5000 0000 0583 9825 74${ZWSP}66.`
    const result = redact(input)
    expect(result.text).toBe("IBAN [IBAN_1].")
    expect(result.restore(result.text)).toBe(input)
  })

  it("still reports spans and values against the original string", () => {
    const input = `Nr ${`850601${ZWSP}2387`} tack`
    const [detection] = redact(input).redactions
    expect(detection).toBeDefined()
    expect(input.slice(detection?.start ?? 0, detection?.end ?? 0)).toBe(detection?.value)
    expect(detection?.value).toContain(ZWSP)
  })

  it("leaves a non-ASCII digit script alone", () => {
    // Arabic-Indic digits have no NFKC mapping to ASCII and do not render as
    // ASCII digits either, so there is nothing to see through here.
    const input = "Nummer ٨٥٠٦٠١٢٣٨٧ i systemet."
    expect(redact(input).text).toBe(input)
  })
})

describe("canonicalize precision trade-offs", () => {
  it("keeps refusing to fuse two visibly separate numbers", () => {
    // DIGIT_RUN only lets a window cross whitespace where the identifier's own
    // separator belongs, four digits from the end. This is the case that rule
    // protects: two unrelated numbers in a table must not become a candidate.
    expect(redact("Belopp 8506 012387 kr").redactions).toHaveLength(0)
    expect(redact("Belopp 8506\n012387 kr").redactions).toHaveLength(0)
  })

  it("does fuse two numbers joined by an invisible character, by design", () => {
    // Deliberate, and the safe direction. An invisible separator renders as
    // nothing, so a human and an LLM both read "8506012387" as one ten-digit
    // number here, exactly as they read a personnummer split the same way (and
    // 8506 + 012387 really is one: Skatteverket publishes it as test data). We
    // cannot tell the two apart, and for a redaction tool over-masking an
    // invoice number beats leaking an identifier. The visible-space case above
    // is the one where the reader sees two numbers, and it still holds.
    const fused = redact(`Belopp 8506${ZWSP}012387 kr`)
    expect(fused.redactions).toHaveLength(1)
    expect(fused.redactions[0]?.label).toBe("PERSONNUMMER")
    expect(fused.restore(fused.text)).toBe(`Belopp 8506${ZWSP}012387 kr`)
  })

  it("clamps an out-of-range span the same way on both paths", () => {
    // A detector handing back a bad span is a bug either way, but it must not
    // be a bug whose symptoms depend on whether the input happened to contain
    // a zero-width space.
    for (const input of ["", "abc", `abc${ZWSP}def`]) {
      const canonical = canonicalize(input)
      const [start, end] = canonical.span(-5, input.length + 99)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeLessThanOrEqual(input.length)
      expect(start).toBeLessThanOrEqual(end)
    }
  })
})
