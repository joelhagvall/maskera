import type { Detection } from "@maska/core"
import { describe, expect, it } from "vitest"
import { type NerRecognizer, redactWithNer } from "../src/index"

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
      return [{ start, end: start + 4, value: "Lars", label: "PERSON" }]
    })

    const { text } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Min granne [PERSON_1] mejlar [EMAIL_1].")
  })

  it("lets rule detections win on overlap (earliest+longest)", async () => {
    const input = "Maila lars@example.se nu."
    // NER wrongly flags just the local-part "lars" inside the email.
    const recognizer = fakeRecognizer((t) => {
      const start = t.indexOf("lars")
      return [{ start, end: start + 4, value: "lars", label: "PERSON" }]
    })

    const { text, redactions } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Maila [EMAIL_1] nu.")
    expect(redactions.map((r) => r.label)).toEqual(["EMAIL"])
  })

  it("can run NER-only when detectors is empty", async () => {
    const recognizer = fakeRecognizer(() => [{ start: 0, end: 4, value: "Lars", label: "PERSON" }])
    const { text } = await redactWithNer("Lars är här.", { recognizer, detectors: [] })
    expect(text).toBe("[PERSON_1] är här.")
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
