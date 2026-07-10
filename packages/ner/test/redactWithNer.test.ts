import type { Detection } from "@maskera/core"
import { describe, expect, it } from "vitest"
import { type NerRecognizer, isWholeWord, redactWithNer } from "../src/index"

describe("isWholeWord (drops mid-word model fragments)", () => {
  it("rejects a fragment inside a larger word", () => {
    expect(isWholeWord("Motpart företräds", 3, 6)).toBe(false) // "par" in Motpart
    expect(isWholeWord("journalen", 4, 6)).toBe(false) // "na" in journalen
  })
  it("accepts real word-boundary spans", () => {
    expect(isWholeWord("Lars Eriksson", 0, 4)).toBe(true) // "Lars"
    expect(isWholeWord("bor i Stockholm.", 6, 15)).toBe(true) // "Stockholm"
  })
})

/** A fake recognizer so we can test the merge logic without loading a model. */
function fakeRecognizer(detections: (text: string) => Detection[]): NerRecognizer {
  return {
    ready: Promise.resolve(),
    detect: async (text) => detections(text),
  }
}

describe("redactWithNer", () => {
  it("merges NER detections with rule detectors", async () => {
    const input = "Min granne Lars mejlar lars@example.se."
    const recognizer = fakeRecognizer((t) => {
      const start = t.indexOf("Lars")
      return [{ start, end: start + 4, value: "Lars", label: "NAMN" }]
    })

    const { text } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Min granne [NAMN_1] mejlar [EPOST_1].")
  })

  it("lets rule detections win on overlap (earliest+longest)", async () => {
    const input = "Maila lars@example.se nu."
    // NER wrongly flags just the local-part "lars" inside the email.
    const recognizer = fakeRecognizer((t) => {
      const start = t.indexOf("lars")
      return [{ start, end: start + 4, value: "lars", label: "NAMN" }]
    })

    const { text, redactions } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Maila [EPOST_1] nu.")
    expect(redactions.map((r) => r.label)).toEqual(["EPOST"])
  })

  it("can run NER-only when detectors is empty", async () => {
    const recognizer = fakeRecognizer(() => [{ start: 0, end: 4, value: "Lars", label: "NAMN" }])
    const { text } = await redactWithNer("Lars är här.", { recognizer, detectors: [] })
    expect(text).toBe("[NAMN_1] är här.")
  })

  it("clips a model span that glues a name to the e-mail local-part (name must not leak)", async () => {
    const input = "Kontakt: Anna Karlsson anna.karlsson@example.se snarast"
    const nameStart = input.indexOf("Anna")
    const spanEnd = input.indexOf("@") // model span swallows the local-part
    const recognizer = fakeRecognizer(() => [
      { start: nameStart, end: spanEnd, value: input.slice(nameStart, spanEnd), label: "NAMN" },
    ])
    const { text, restore } = await redactWithNer(input, { recognizer })
    expect(text).not.toContain("Anna Karlsson")
    expect(text).toContain("[EPOST_1]")
    expect(restore(text)).toBe(input)
  })

  it("keeps both sides when a rule span sits inside a model span", async () => {
    const input = "ring Lars 070-174 06 58 Eriksson imorgon"
    const recognizer = fakeRecognizer(() => [
      { start: 5, end: 32, value: input.slice(5, 32), label: "NAMN" },
    ])
    const { text, restore } = await redactWithNer(input, { recognizer })
    expect(text).not.toContain("Lars")
    expect(text).not.toContain("Eriksson")
    expect(text).toContain("[TELEFON_1]")
    expect(restore(text)).toBe(input)
  })

  it("drops model fragments that overlap a structured rule (IBAN not shredded)", async () => {
    const input = "Konto IBAN SE4550000000058398257466 men ring Lars."
    // The model wrongly tags digit chunks of the IBAN as addresses, and a name.
    const recognizer = fakeRecognizer((t) => {
      const i = t.indexOf("SE45")
      const lars = t.indexOf("Lars")
      return [
        { start: t.indexOf("IBAN"), end: i + 4, value: "IBAN SE45", label: "ADR" },
        { start: i + 6, end: i + 12, value: "000000", label: "ADR" },
        { start: lars, end: lars + 4, value: "Lars", label: "PER" },
      ]
    })
    const { text, redactions } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Konto IBAN [IBAN_1] men ring [PER_1].")
    expect(redactions.map((r) => r.label).sort()).toEqual(["IBAN", "PER"])
  })
})
