import { describe, expect, it } from "vitest"
import {
  isOrganisationsnummer,
  isPersonnummer,
  luhnValid,
  personnummer,
  redact,
  regexDetector,
  restore,
} from "../src/index"

// 900101-2385 is an official Skatteverket test personnummer; 556123-4567 is
// Bolagsverket's own documentation example orgnr. Both Luhn-valid, neither real.
const PNR = "19900101-2385"
const ORGNR = "556123-4567"

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
    const input = `Jag heter Anna och mejlar anna@example.se, ringer 070-174 06 58, personnummer ${PNR}.`
    const { text, redactions } = redact(input)
    expect(text).not.toContain("anna@example.se")
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
    expect(() => redact("a@b.se och c@d.se", { placeholder: () => "[X]" })).toThrow(/unique/)
    // ...but one that honours the index is fine.
    const { text, map } = redact("a@b.se och c@d.se", {
      placeholder: (label, n) => `<${label}:${n}>`,
    })
    expect(text).toBe("<EPOST:1> och <EPOST:2>")
    expect(map["<EPOST:1>"]).toBe("a@b.se")
  })

  it("uses stable placeholders for repeated values", () => {
    const input = `Maila ${"a@b.se"} eller igen ${"a@b.se"}`
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
    const input = "Svara vid [EPOST_1] ovan. Kontakt: a@b.se"
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
})
