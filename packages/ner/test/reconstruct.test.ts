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

  it("keeps a trailing house number in an address span", () => {
    const text = "Jag bor på Maskeravägen 44 i Stockholm."
    const out = reconstruct(
      text,
      [tok("B-ADR", "Maskera", 4), tok("B-ADR", "##vägen", 5), tok("I-ADR", "44", 6)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 11, end: 26, value: "Maskeravägen 44", label: "ADR" }])
  })

  it("still drops a numeric-only address prediction", () => {
    const text = "Mötet är 14 30 idag."
    const out = reconstruct(text, [tok("B-ADR", "14", 3), tok("I-ADR", "30", 4)], labelMap, 0.5)
    expect(out).toEqual([])
  })

  it("extends an address over a detached A-D house suffix", () => {
    const text = "Paketet går till Maskeragatan 46 C imorgon."
    const out = reconstruct(
      text,
      [tok("B-ADR", "Maskeragatan", 4), tok("I-ADR", "46", 5)],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "Maskeragatan 46 C", label: "ADR" })
  })

  it("does not absorb a following preposition into an address", () => {
    const text = "Jag bor på Maskeragatan 46 i Stockholm."
    const out = reconstruct(
      text,
      [tok("B-ADR", "Maskeragatan", 4), tok("I-ADR", "46", 5)],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "Maskeragatan 46", label: "ADR" })
  })

  it("merges adjacent address fragments separated only by whitespace", () => {
    const text = "Skicka till Maskeras gata 22 idag."
    const out = reconstruct(
      text,
      [
        tok("B-ADR", "Maskera", 3),
        tok("B-ADR", "##s", 4),
        tok("B-ADR", "gata", 5),
        tok("I-ADR", "22", 6),
      ],
      labelMap,
      0.5,
    )
    expect(out[0]).toMatchObject({ value: "Maskeras gata 22", label: "ADR" })
  })

  it("repairs an address prefix that q4 mislabeled as another entity", () => {
    const text = "Skicka till Maskeras gata 22 idag."
    const out = reconstruct(
      text,
      [
        tok("B-ORG", "Maskera", 3),
        tok("B-ORG", "##s", 4),
        tok("B-ADR", "gata", 5),
        tok("I-ADR", "22", 6),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 12, end: 28, value: "Maskeras gata 22", label: "ADR" }])
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
    // The model tagged only "##r" of "dr", the whole word must be redacted,
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

  it("trims a swallowed 'org' label word from an ORG span (org.nr frame)", () => {
    // The demo Juridik example: the model tagged "Kommun A, org" as one ORG
    // group, leaving "[ORGANISATION].nr" in the redacted output.
    const text = "yrkar skadestånd mot Kommun A, org.nr 202100-4748."
    const out = reconstruct(
      text,
      [
        tok("B-ORG", "Kommun", 3),
        tok("I-ORG", "A", 4),
        tok("I-ORG", ",", 5),
        tok("I-ORG", "org", 6),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 21, end: 29, value: "Kommun A", label: "ORGANIZATION" }])
  })

  it("trims a swallowed 'pnr' label word from a PER span", () => {
    const text = "Klient Eva Lind, pnr 850601-2387, kallas."
    const out = reconstruct(
      text,
      [
        tok("B-PER", "Eva", 1),
        tok("I-PER", "Lind", 2),
        tok("I-PER", ",", 3),
        tok("I-PER", "pnr", 4),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 7, end: 15, value: "Eva Lind", label: "PERSON" }])
  })

  it("keeps the 'nr' inside an ADR span that ends with the house number", () => {
    const text = "Hyresgästen på Testgatan nr 5 har sagt upp avtalet."
    const out = reconstruct(
      text,
      [tok("B-ADR", "Testgatan", 3), tok("I-ADR", "nr", 4), tok("I-ADR", "5", 5)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 15, end: 29, value: "Testgatan nr 5", label: "ADR" }])
  })

  it("keeps an entity that IS a label-like word intact (no separator, no trim)", () => {
    const text = "Han jobbar på Org i stan."
    const out = reconstruct(text, [tok("B-ORG", "Org", 3)], labelMap, 0.5)
    expect(out).toEqual([{ start: 14, end: 17, value: "Org", label: "ORGANIZATION" }])
  })

  it("widens an ADR span that stopped before the house number", () => {
    // "Testby plats 1": the model tagged the street words but left the
    // house number outside the span, materially narrowing the address.
    const text = "Konferensen hålls på Testby plats 1 imorgon."
    const out = reconstruct(
      text,
      [tok("B-ADR", "Testby", 4), tok("I-ADR", "plats", 5)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 21, end: 35, value: "Testby plats 1", label: "ADR" }])
  })

  it("widens across the 'nr' form and a detached letter", () => {
    const text = "Returen går till Testgatan nr 5 b enligt avtalet."
    const out = reconstruct(text, [tok("B-ADR", "Testgatan", 4)], labelMap, 0.5)
    expect(out).toEqual([{ start: 17, end: 33, value: "Testgatan nr 5 b", label: "ADR" }])
  })

  it("does not widen an ADR span across ordinary following words", () => {
    const text = "Vi ses på Testgatan klockan sex."
    const out = reconstruct(text, [tok("B-ADR", "Testgatan", 3)], labelMap, 0.5)
    expect(out).toEqual([{ start: 10, end: 19, value: "Testgatan", label: "ADR" }])
  })

  // locateGroup caps the whitespace it skips between two pieces of one
  // entity (PDF extraction produces runs like this without anyone crafting
  // them): without a bound the retry loop re-walked the run once per anchor,
  // and pieces this far apart are not one entity anyway. The group is now
  // dropped, fast.
  it("does not join pieces across a huge whitespace run", () => {
    const text = `Anna${" ".repeat(200_000)}Andersson, org.nr 202100-4748`
    const started = performance.now()
    const out = reconstruct(
      text,
      [tok("B-PER", "Anna", 0), tok("I-PER", "Andersson", 1)],
      labelMap,
      0.5,
    )
    expect(performance.now() - started).toBeLessThan(2000)
    expect(out).toEqual([])
  })

  it("still joins pieces across an ordinary whitespace gap", () => {
    const text = `Anna${" ".repeat(16)}Andersson`
    const out = reconstruct(
      text,
      [tok("B-PER", "Anna", 0), tok("I-PER", "Andersson", 1)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 0, end: text.length, value: text, label: "PERSON" }])
  })

  it("still trims a label separated by several spaces and a comma", () => {
    const text = "Kommun A ,  org.nr 202100-4748"
    const out = reconstruct(text, [tok("B-ORG", "Kommun", 0), tok("I-ORG", "A", 1)], labelMap, 0.5)
    expect(out).toEqual([{ start: 0, end: 8, value: "Kommun A", label: "ORGANIZATION" }])
  })
})

describe("reconstruct locates the right occurrence", () => {
  it("prefers the case-exact occurrence over an earlier lower-case one", () => {
    // The span search is case-insensitive so an identically spelled word
    // earlier in the sentence used to shadow the tagged one, masking "berg"
    // and leaving the real "Berg" in the clear. Swedish makes this ordinary:
    // Berg, Ek, Lund, Sten, Ros and Ström are names and common words at once.
    const text = "berg hörde av sig. Kontakta Berg om det."
    const out = reconstruct(text, [tok("B-PER", "Berg", 7)], labelMap, 0.5)
    expect(out).toEqual([{ start: 28, end: 32, value: "Berg", label: "PERSON" }])
  })

  it("falls back to a folded match when no case-exact one exists", () => {
    const text = "Kontakta BERG om det."
    const out = reconstruct(text, [tok("B-PER", "Berg", 2)], labelMap, 0.5)
    expect(out).toEqual([{ start: 9, end: 13, value: "BERG", label: "PERSON" }])
  })

  it("uses tokenizer offsets when the tokenizer reports them", () => {
    const text = "anna hörde av sig. Kontakta anna om det."
    const out = reconstruct(
      text,
      [{ ...tok("B-PER", "anna", 7), start: 28, end: 32 }],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 28, end: 32, value: "anna", label: "PERSON" }])
  })

  it("advances the cursor over O tokens so a later duplicate is found", () => {
    const text = "anna hörde av sig. Kontakta anna om det."
    const out = reconstruct(
      text,
      [
        tok("O", "anna", 1),
        tok("O", "hörde", 2),
        tok("O", "av", 3),
        tok("O", "sig", 4),
        tok("O", ".", 5),
        tok("O", "Kontakta", 6),
        tok("B-PER", "anna", 7),
      ],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 28, end: 32, value: "anna", label: "PERSON" }])
  })

  it("does not let an unlocatable O token drag the cursor past a real entity", () => {
    // A tokenizer that strips accents reports "asa" for "Åsa", which cannot be
    // found at its true position. Advancing to some far-off later occurrence
    // would skip everything in between, so the cursor must simply stay put.
    const text = "Åsa och Anna kom. Sedan kom asa igen."
    const out = reconstruct(
      text,
      [tok("O", "asa", 1), tok("O", "och", 2), tok("B-PER", "Anna", 3)],
      labelMap,
      0.5,
    )
    expect(out).toEqual([{ start: 8, end: 12, value: "Anna", label: "PERSON" }])
  })
})
