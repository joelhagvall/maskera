import { describe, expect, it } from "vitest"
import { type RawToken, reconstruct } from "../src/index"

const labelMap = (group: string) =>
  ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION" })[group] ?? group

const tok = (entity: string, word: string, index: number, score = 0.99): RawToken => ({
  entity,
  word,
  index,
  score,
})

describe("reconstruct", () => {
  it("finds a plain two-word name", () => {
    const text = "Jag heter Anna Karlsson idag."
    const out = reconstruct(
      text,
      [tok("B-PER", "Anna", 3), tok("I-PER", "Karlsson", 4)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 10, end: 23, value: "Anna Karlsson", label: "PERSON" }])
  })

  it("reassembles a hyphenated name (tokenizer splits on '-')", () => {
    const text = "Handläggaren Karl-Gustav Åberg återkommer."
    const out = reconstruct(
      text,
      [
        tok("B-PER", "Karl", 4),
        tok("I-PER", "-", 5),
        tok("I-PER", "Gustav", 6),
        tok("I-PER", "Åberg", 7),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 13, end: 30, value: "Karl-Gustav Åberg", label: "PERSON" }])
  })

  it("reassembles an ampersand org like H&M", () => {
    const text = "Hon jobbar på H&M i Stockholm."
    const out = reconstruct(
      text,
      [tok("B-ORG", "H", 4), tok("I-ORG", "&", 5), tok("I-ORG", "M", 6)],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "H&M", label: "ORGANIZATION" })
  })

  it("merges subword continuations without inserting spaces", () => {
    const text = "Patienten Muhammed al-Rashid kom in."
    const out = reconstruct(
      text,
      [
        tok("B-PER", "Muhammed", 2),
        tok("I-PER", "al", 3),
        tok("I-PER", "-", 4),
        tok("I-PER", "Rash", 5),
        tok("I-PER", "##id", 6),
      ],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "Muhammed al-Rashid", label: "PERSON" })
  })

  it("widens a leading tagged subword to the word boundary", () => {
    // The model tagged only "##r" of "dr" — the whole word must be redacted,
    // not silently dropped (which would leak "Svensson").
    const text = "träffade dr Svensson på sjukhuset"
    const out = reconstruct(
      text,
      [tok("B-PER", "##r", 3), tok("I-PER", "Svensson", 4)],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "dr Svensson", label: "PERSON" })
  })

  it("bridges a stray B- tag mid-entity (Karl- must not leak)", () => {
    // q4 model on "Hej, jag heter Karl-Gustav Åberg, …" emits B-PER Karl,
    // I-PER -, B-PER Gustav, I-PER Åberg. One span, no dangling "Karl-".
    const text = "Hej, jag heter Karl-Gustav Åberg, tack."
    const out = reconstruct(
      text,
      [
        tok("B-PER", "Karl", 5),
        tok("I-PER", "-", 6),
        tok("B-PER", "Gustav", 7),
        tok("I-PER", "Åberg", 8),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 15, end: 32, value: "Karl-Gustav Åberg", label: "PERSON" }])
  })

  it("does not glue two adjacent B- words together", () => {
    // "imorgon" false-positively tagged B-PER right after "Sofia" must stay
    // a separate group (and its own span), not widen Sofia's placeholder.
    const text = "kan du ringa Sofia imorgon?"
    const out = reconstruct(
      text,
      [tok("B-PER", "Sofia", 4), tok("B-PER", "imorgon", 5)],
      labelMap,
      0.5,
    )
    expect(out.map((d) => d.value)).toEqual(["Sofia", "imorgon"])
  })

  it("trims a trailing punctuation token instead of dropping the group", () => {
    const text = "Vi mötte Anna - sedan gick vi hem."
    const out = reconstruct(text, [tok("B-PER", "Anna", 3), tok("I-PER", "-", 4)], labelMap, 0.5)
    expect(out[0]).toMatchObject({ value: "Anna", label: "PERSON" })
  })

  it("drops a lone subword fragment inside a longer word", () => {
    const text = "Motparten svarade aldrig."
    const out = reconstruct(text, [tok("B-PER", "##par", 2)], labelMap, 0.5)
    expect(out).toEqual([])
  })

  it("widens over a trailing genitive s (Anna Karlssons must not leak)", () => {
    // The vocab-trimmed model stops before the possessive s; the whole-word
    // guard used to reject the span wholesale and leak the full name.
    const text = "Anna Karlssons journal ska uppdateras."
    const out = reconstruct(
      text,
      [tok("B-PER", "Anna", 1), tok("I-PER", "Karlsson", 2)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 0, end: 14, value: "Anna Karlssons", label: "PERSON" }])
  })

  it("widens over a lowercase genitive s too", () => {
    const text = "det är annas bil som står utanför"
    const out = reconstruct(text, [tok("B-PER", "anna", 3)], labelMap, 0.5)
    expect(out[0]).toMatchObject({ value: "annas", label: "PERSON" })
  })

  it("still rejects a prefix of a genuinely different word (Lars in Larssons)", () => {
    const text = "Larssons väg är lång."
    const out = reconstruct(text, [tok("B-PER", "Lars", 1)], labelMap, 0.5)
    expect(out).toEqual([])
  })

  it("keeps positions exact when lowercasing would change string length", () => {
    // "İ".toLowerCase() is TWO code units (i + combining dot). If positions
    // are computed on a naively lowered string they drift against the
    // original and the entity is silently dropped, i.e. leaked.
    const text = "İİİİ heter Anna sa han."
    const out = reconstruct(text, [tok("B-PER", "Anna", 3)], labelMap, 0.5)
    expect(out).toHaveLength(1)
    expect(text.slice(out[0]?.start, out[0]?.end)).toBe("Anna")
  })

  it("locates an entity that itself contains İ", () => {
    const text = "kontakta İlker Aydın imorgon"
    const out = reconstruct(
      text,
      [tok("B-PER", "İlker", 2), tok("I-PER", "Aydın", 3)],
      labelMap,
      0.5,
    )
    expect(out).toHaveLength(1)
    expect(text.slice(out[0]?.start, out[0]?.end)).toBe(out[0]?.value)
  })

  it("drops groups below minScore", () => {
    const text = "Kanske Anna kommer."
    const out = reconstruct(text, [tok("B-PER", "Anna", 2, 0.3)], labelMap, 0.5)
    expect(out).toEqual([])
  })
})
