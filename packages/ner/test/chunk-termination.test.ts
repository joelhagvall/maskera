import { describe, expect, it } from "vitest"
import { splitPoint } from "../src/index"

// detect() splits over-limit input recursively, so the ONLY thing standing
// between it and an infinite loop is that both halves come out strictly
// shorter than the input. That used to be assumed rather than enforced:
// splitting preferred a whitespace position found by scanning up to 200
// characters down from the middle, and on a short-but-token-dense chunk whose
// only space sat near the start, the right-hand slice came back as the WHOLE
// input. 500 characters of CJK were enough to hang detect() permanently.
//
// This is asserted on the pure split function rather than through detect() on
// purpose. The runaway recursion floods the microtask queue, which starves
// timers, so a Promise.race timeout never fires: a regression tested through
// detect() would hang the whole test run instead of failing it.

/**
 * Two separate properties, and it matters which is which.
 *
 * Termination: both slices must be strictly shorter than the input.
 * Coverage: the halves must not leave a gap between them, or the text in the
 * gap is never shown to the model at all, which for a redaction tool is a leak
 * rather than a hang. They may touch (`leftEnd === rightStart`) on chunks too
 * small for a non-zero overlap; those can never reach a split anyway, since a
 * chunk has to exceed MAX_TOKENS to be split at all.
 */
const invariantHolds = (chunk: string) => {
  const { leftEnd, rightStart } = splitPoint(chunk)
  const terminates = leftEnd < chunk.length && rightStart > 0
  const covers = leftEnd >= rightStart
  return terminates && covers
}

describe("splitPoint always makes progress", () => {
  it("shrinks both halves for the crafted 500-character fixed point", () => {
    // Middle is 250, the search reaches down to 51 and lands on the space at
    // 55; overlap is 62, so rightStart used to clamp to 0 and hand back the
    // input unchanged.
    const chunk = `${"文".repeat(55)} ${"文".repeat(444)}`
    expect(chunk).toHaveLength(500)
    const { leftEnd, rightStart } = splitPoint(chunk)
    expect(rightStart).toBeGreaterThan(0)
    expect(leftEnd).toBeLessThan(chunk.length)
  })

  it("holds for every length and whitespace position the search can reach", () => {
    // Exhaustive over the band where the window can reach the start (the only
    // place the old arithmetic failed), plus a margin on both sides.
    const failures: string[] = []
    for (let length = 2; length <= 1200; length++) {
      const half = Math.floor(length / 2)
      // No whitespace at all, then a space at every position the search visits.
      const layouts = [-1]
      for (let p = Math.max(2, half - 199); p <= half; p++) layouts.push(p)
      for (const spaceAt of layouts) {
        const chunk =
          spaceAt < 0
            ? "文".repeat(length)
            : `${"文".repeat(spaceAt)} ${"文".repeat(length - spaceAt - 1)}`
        if (!invariantHolds(chunk)) failures.push(`length ${length}, space at ${spaceAt}`)
      }
    }
    expect(failures.slice(0, 5)).toEqual([])
  })

  it("still prefers a whitespace cut in ordinary prose", () => {
    // The guard must not silently disable the whitespace preference: a cut in
    // the middle of a word is what the overlap exists to avoid.
    const chunk = "Anna Andersson bor i Uppsala. ".repeat(40)
    const { rightStart } = splitPoint(chunk)
    expect(chunk[rightStart + Math.min(100, Math.floor(chunk.length / 8))]).toMatch(/\s/)
  })
})
