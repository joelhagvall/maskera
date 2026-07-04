import { describe, expect, it, vi } from "vitest"
import { type RawToken, createNerRecognizer } from "../src/index"

// BERT's positional embeddings stop at 512 tokens; unchunked long inputs make
// the ONNX runtime throw and the whole redaction fail. detect() must split
// long text with an overlap so entities at a seam still come out whole, and
// positions must stay correct in the original string.

let calls: string[] = []

const makeTokens = (chunk: string): RawToken[] => {
  const out: RawToken[] = []
  const re = /\b(Nils Åberg|Anna|Erik)\b/g
  let m = re.exec(chunk)
  let index = 1
  while (m) {
    const words = m[1].split(" ")
    for (let w = 0; w < words.length; w++) {
      out.push({
        entity: w === 0 ? "B-PER" : "I-PER",
        word: words[w] as string,
        index: index + w,
        score: 0.99,
      })
    }
    index += 10
    m = re.exec(chunk)
  }
  return out
}

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: async () => {
    const pipe = async (chunk: string) => {
      calls.push(chunk)
      return makeTokens(chunk)
    }
    // ~4 chars per token, like ordinary Swedish prose
    pipe.tokenizer = { encode: (s: string) => new Array(Math.ceil(s.length / 4) + 2).fill(0) }
    return pipe
  },
}))

describe("long-text chunking", () => {
  it("splits over-limit input, keeps absolute positions, dedupes the seam", async () => {
    calls = []
    const filler = "helt vanlig text utan innehåll som fyller ut dokumentet ordentligt. "
    const text = `Erik skrev början. ${filler.repeat(40)}Nils Åberg står vid sömmen. ${filler.repeat(40)}Till sist svarade Anna direkt.`

    const out = await createNerRecognizer().detect(text)

    expect(calls.length).toBeGreaterThan(1) // chunking actually happened
    const values = out.map((d) => d.value)
    expect(values).toContain("Erik")
    expect(values).toContain("Nils Åberg")
    expect(values).toContain("Anna")
    // no duplicate spans from the overlap zone
    const keys = out.map((d) => `${d.start}:${d.end}`)
    expect(new Set(keys).size).toBe(keys.length)
    // every detection maps back to the exact original slice
    for (const d of out) {
      expect(text.slice(d.start, d.end)).toBe(d.value)
    }
  })

  it("short input stays a single model call", async () => {
    calls = []
    const out = await createNerRecognizer().detect("Anna skriver kort.")
    expect(calls.length).toBe(1)
    expect(out.map((d) => d.value)).toEqual(["Anna"])
  })
})
// The no-tokenizer fallback (single pass, previous behaviour) is covered by
// denylist.test.ts, whose mocked pipeline has no .tokenizer.
