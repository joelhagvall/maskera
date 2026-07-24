import { describe, expect, it, vi } from "vitest"
import { createNerRecognizer, type RawToken } from "../src/index"

// Long input is split into overlapping chunks, so the same entity is scored
// twice with the model seeing different context each time. That is the whole
// point of the overlap, and it means the two spans can differ at BOTH edges.
//
// The dedupe used to keep whichever span was longer and discard the other
// wholesale. `collected` is sorted by ascending start, so a longer span can
// still begin LATER, and replacing the earlier one dropped its head: a name cut
// by the seam ("Anna Karlsson" from the left chunk, "Karlsson Bergstrom" from
// the right) lost its first name to the output in the clear.

const state = { calls: 0 }

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: async () => {
    const pipe = async (chunk: string): Promise<RawToken[]> => {
      state.calls++
      // The left chunk sees the name truncated; the right one sees a longer
      // span that starts one word later.
      if (chunk.includes("Anna Karlsson") && state.calls === 1) {
        return [
          { entity: "B-PER", word: "Anna", index: 1, score: 0.99 },
          { entity: "I-PER", word: "Karlsson", index: 2, score: 0.99 },
        ]
      }
      if (chunk.includes("Karlsson Bergstrom")) {
        return [
          { entity: "B-PER", word: "Karlsson", index: 1, score: 0.99 },
          { entity: "I-PER", word: "Bergstrom", index: 2, score: 0.99 },
        ]
      }
      return []
    }
    // 1 token per character, so the input above is split.
    pipe.tokenizer = { encode: (s: string) => new Array(s.length + 2).fill(0) }
    return pipe
  },
}))

describe("seam dedupe covers the union of both chunks' spans", () => {
  it("does not drop the head of a span the other chunk started earlier", async () => {
    state.calls = 0
    const filler = "x".repeat(300)
    const name = "Anna Karlsson Bergstrom"
    const text = `${filler} ${name} ${filler}`

    const out = await createNerRecognizer().detect(text)

    // Every returned span must still describe its own text.
    for (const d of out) expect(text.slice(d.start, d.end)).toBe(d.value)

    // Nothing inside the name may be left for the output.
    const start = text.indexOf(name)
    let uncovered = ""
    for (let p = start; p < start + name.length; p++) {
      if (!out.some((d) => p >= d.start && p < d.end)) uncovered += text[p]
    }
    expect(uncovered, "characters of the name left unmasked").toBe("")
  })
})
