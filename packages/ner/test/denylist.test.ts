import { describe, expect, it, vi } from "vitest"
import { createNerRecognizer, type RawToken } from "../src/index"

// The q4 model confidently tags common Swedish words in name-like positions
// (observed in the demo scenarios): "Kund" and "Mail" as B-PER at ~1.0,
// "maila" as B-PER, "bankgiro" as B-ORG. A score threshold can't fix that,
// so createNerRecognizer drops detections whose whole surface form is a
// denylisted word. These tests mock the Transformers.js pipeline with the
// real token output the model produced for those inputs.

let rawTokens: RawToken[] = []

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: async () => async () => rawTokens,
}))

const tok = (entity: string, word: string, index: number, score = 0.99): RawToken => ({
  entity,
  word,
  index,
  score,
})

describe("createNerRecognizer denylist", () => {
  it('drops "Kund" but keeps the name that follows it', async () => {
    rawTokens = [
      tok("B-PER", "Kun", 1),
      tok("B-PER", "##d", 2),
      tok("B-PER", "Maria", 3),
      tok("I-PER", "Johansson", 4),
    ]
    const out = await createNerRecognizer().detect("Kund Maria Johansson hör av sig.")
    expect(out).toEqual([{ start: 5, end: 20, value: "Maria Johansson", label: "NAMN" }])
  })

  it('drops "Mail" and "maila" false positives (case-insensitive)', async () => {
    rawTokens = [tok("B-PER", "Mai", 1), tok("B-PER", "##l", 2)]
    expect(await createNerRecognizer().detect("Mail: nedan.")).toEqual([])

    rawTokens = [tok("B-PER", "ma", 1), tok("B-PER", "##ila", 2)]
    expect(await createNerRecognizer().detect("och maila sammanfattning.")).toEqual([])
  })

  it('drops "bankgiro" tagged as an organisation', async () => {
    rawTokens = [tok("B-ORG", "bank", 1), tok("I-ORG", "##gi", 2), tok("I-ORG", "##ro", 3)]
    const out = await createNerRecognizer().detect("Betalning sker till bankgiro 5051-6905.")
    expect(out).toEqual([])
  })

  it("only drops whole-value matches, never words inside a longer entity", async () => {
    rawTokens = [tok("B-ORG", "Bankgiro", 1), tok("I-ORG", "##centralen", 2), tok("I-ORG", "AB", 3)]
    const out = await createNerRecognizer().detect("Avtal med Bankgirocentralen AB idag.")
    expect(out).toEqual([
      { start: 10, end: 30, value: "Bankgirocentralen AB", label: "ORGANISATION" },
    ])
  })

  it("denylist: null disables the filter", async () => {
    rawTokens = [tok("B-PER", "Kun", 1), tok("B-PER", "##d", 2)]
    const out = await createNerRecognizer({ denylist: null }).detect("Kund hör av sig.")
    expect(out).toEqual([{ start: 0, end: 4, value: "Kund", label: "NAMN" }])
  })

  it("a custom denylist replaces the default", async () => {
    rawTokens = [tok("B-PER", "Kun", 1), tok("B-PER", "##d", 2)]
    const out = await createNerRecognizer({ denylist: ["imorgon"] }).detect("Kund hör av sig.")
    expect(out).toEqual([{ start: 0, end: 4, value: "Kund", label: "NAMN" }])
  })
})
