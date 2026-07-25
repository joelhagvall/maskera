import { describe, expect, it } from "vitest"
import {
  isOrganisationsnummer,
  isPersonnummer,
  luhnValid,
  personnummer,
  redact,
  redactFromDetections,
  regexDetector,
  restore,
} from "../src/index"

// Skatteverket publishes 900101-2385 as test data and uses 202100-4748 for the
// fictitious Kommun A in its Navet test certificate.
const PNR = "19900101-2385"
const ORGNR = "202100-4748"

describe("validators", () => {
  it("validates Luhn checksums", () => {
    expect(luhnValid("9001012385")).toBe(true)
    expect(luhnValid("9001010018")).toBe(false)
  })

  it("validates personnummer", () => {
    expect(isPersonnummer(PNR)).toBe(true)
    expect(isPersonnummer("900101-2385")).toBe(true)
    expect(isPersonnummer("900101-0018")).toBe(false)
    expect(isPersonnummer("991399-0017")).toBe(false) // bad month
  })

  it("validates organisationsnummer", () => {
    expect(isOrganisationsnummer(ORGNR)).toBe(true)
    expect(isOrganisationsnummer("123456-7890")).toBe(false)
  })
})

describe("redact", () => {
  it("redacts a mix of Swedish PII", () => {
    const input = `Jag heter Anna och mejlar anna@example.com, ringer 070-174 06 58, personnummer ${PNR}.`
    const { text, redactions } = redact(input)
    expect(text).not.toContain("anna@example.com")
    expect(text).not.toContain(PNR)
    expect(text).not.toContain("070-174 06 58")
    const labels = redactions.map((r) => r.label).sort()
    expect(labels).toContain("EPOST")
    expect(labels).toContain("TELEFON")
    expect(labels).toContain("PERSONNUMMER")
  })

  it("never maps two values to one token (index-ignoring placeholder throws)", () => {
    // A custom placeholder() that ignores the index would silently map two
    // values to the same token and corrupt restore(); it must throw instead.
    expect(() => redact("a@example.com och c@example.org", { placeholder: () => "[X]" })).toThrow(
      /unique/,
    )
    // ...but one that honours the index is fine.
    const { text, map } = redact("a@example.com och c@example.org", {
      placeholder: (label, n) => `<${label}:${n}>`,
    })
    expect(text).toBe("<EPOST:1> och <EPOST:2>")
    expect(map["<EPOST:1>"]).toBe("a@example.com")
  })

  it("uses stable placeholders for repeated values", () => {
    const input = `Maila ${"a@example.com"} eller igen ${"a@example.com"}`
    const { text, map } = redact(input)
    const tokens = text.match(/\[EPOST_\d+\]/g) ?? []
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toBe(tokens[1]) // same value -> same token
    expect(Object.keys(map)).toHaveLength(1)
  })

  it("round-trips via restore", () => {
    const input = `Personnummer ${PNR} och org ${ORGNR}.`
    const { text, restore: undo } = redact(input)
    expect(undo(text)).toBe(input)
  })

  it("restores even when the LLM reorders placeholders", () => {
    const input = `Hej ${PNR}, ditt org-nr är ${ORGNR}.`
    const { text, map } = redact(input)
    const firstToken = text.match(/\[PERSONNUMMER_\d+\]/)?.[0] as string
    const orgToken = text.match(/\[ORGANISATIONSNUMMER_\d+\]/)?.[0] as string
    const llmReply = `Bekräftat: ${orgToken} hör till ${firstToken}.`
    expect(restore(llmReply, map)).toBe(`Bekräftat: ${ORGNR} hör till ${PNR}.`)
  })

  it("does not redact an invalid personnummer-shaped number", () => {
    const { redactions } = redact("Referens 123456-0000 i ärendet.", {
      detectors: [personnummer],
    })
    expect(redactions).toHaveLength(0)
  })

  it("supports custom detectors", () => {
    const apartment = regexDetector("LAGENHETSNUMMER", /\blgh\s?\d{4}\b/gi)
    const { text } = redact("Bor i lgh 1203 på plan 4.", { detectors: [apartment] })
    expect(text).toBe("Bor i [LAGENHETSNUMMER_1] på plan 4.")
  })

  it("never hands out a token that already occurs literally in the input", () => {
    // A crafted input embeds a token-shaped string; the real detection must
    // not collide with it, or restore() would write the real value into the
    // attacker-chosen position.
    const input = "Svara vid [EPOST_1] ovan. Kontakt: a@example.com"
    const { text, map, restore: undo } = redact(input)
    expect(text).toBe("Svara vid [EPOST_1] ovan. Kontakt: [EPOST_2]")
    expect(Object.keys(map)).toEqual(["[EPOST_2]"])
    expect(undo(text)).toBe(input) // the spoofed token stays untouched
  })

  it("skips every colliding index, not just the first", () => {
    const input = `[PERSONNUMMER_1] [PERSONNUMMER_2] ${PNR}`
    const { text, map } = redact(input)
    expect(text).toBe("[PERSONNUMMER_1] [PERSONNUMMER_2] [PERSONNUMMER_3]")
    expect(map["[PERSONNUMMER_3]"]).toBe(PNR)
  })

  it("keeps going when the input is seeded with a hundred token-shaped strings", () => {
    // Skipping collisions used to give up after a fixed number of tries, so
    // pasting "[EPOST_1]".."[EPOST_120]" ahead of a real address was enough to
    // make redaction throw instead of redact. Fail-closed, but attacker-chosen.
    const seeded = Array.from({ length: 120 }, (_, i) => `[EPOST_${i + 1}]`).join(" ")
    const { text, map } = redact(`${seeded} kontakt: a@example.com`)
    expect(text.endsWith("[EPOST_121]")).toBe(true)
    expect(map["[EPOST_121]"]).toBe("a@example.com")
  })

  it("stays fast on a document with thousands of distinct values", () => {
    // The collision check and restore() were both O(values × text): 4k values
    // in 150 KB took 237 ms and grew with the product, so a log dump blocked
    // for seconds.
    const input = Array.from(
      { length: 4000 },
      (_, i) => `anv${i}@example.com loggade in fran 192.0.2.1`,
    ).join("\n")
    const started = performance.now()
    const { text, restore: undo } = redact(input)
    expect(performance.now() - started).toBeLessThan(2000)
    expect(text).not.toContain("@example.com")
    expect(undo(text)).toBe(input)
  })

  it("reports a capture group's real span, not the first place its text occurs", () => {
    // `m[0].indexOf(value)` finds the copy inside the consumed left guard, so
    // the detector masked the guard and left the captured value in the clear.
    const detector = regexDetector("NAMN", /(?:Anna )(Anna)/g)
    expect(detector.detect("Hej Anna Anna!")).toEqual([{ start: 9, end: 13, value: "Anna" }])
    const { text } = redact("Hej Anna Anna!", { detectors: [detector] })
    expect(text).toBe("Hej Anna [NAMN_1]!")
  })
})

describe("redactFromDetections", () => {
  it("rejects a malformed span instead of duplicating text", () => {
    // A reversed span sorted into place and the rebuild loop then emitted the
    // text between the previous end and `start` twice: silent corruption of a
    // document someone is redacting.
    const input = "Anna Andersson bor i Lund."
    expect(() =>
      redactFromDetections(input, [{ start: 14, end: 5, value: "Anna", label: "NAMN" }]),
    ).toThrow(/out of range/)
    expect(() =>
      redactFromDetections(input, [{ start: 0, end: 999, value: input, label: "NAMN" }]),
    ).toThrow(/out of range/)
    expect(() =>
      redactFromDetections(input, [{ start: 5, end: 5, value: "", label: "NAMN" }]),
    ).toThrow(/out of range/)
  })
})

describe("restore", () => {
  it("does not substitute inside a value it just inserted", () => {
    // Replacing token by token re-scanned text that was already restored, so a
    // value containing another token (values can come from a caller via
    // redactFromDetections) got substituted a second time and the output was
    // neither the placeholder nor the original.
    const map = { "[NAMN_1]": "Anna [ORT_1]", "[ORT_1]": "Lund" }
    expect(restore("Hej [NAMN_1].", map)).toBe("Hej Anna [ORT_1].")
  })

  it("still prefers the longest token at a position", () => {
    const map = { "[X_1]": "ett", "[X_10]": "tio" }
    expect(restore("[X_10] och [X_1]", map)).toBe("tio och ett")
  })
})
