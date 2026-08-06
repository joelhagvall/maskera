import type { Detection } from "@maskera/core"
import { describe, expect, it } from "vitest"
import {
  clinicalPrecisionFilter,
  defaultLabelMap,
  isWholeWord,
  type NerRecognizer,
  type RawToken,
  reconstruct,
  redactWithNer,
} from "../src/index"

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

describe("defaultLabelMap", () => {
  it("maps maskera-sv-ner's groups to the Swedish rule labels", () => {
    expect(defaultLabelMap("PER")).toBe("NAMN")
    expect(defaultLabelMap("B-LOC")).toBe("PLATS")
    expect(defaultLabelMap("I-ORG")).toBe("ORGANISATION")
    expect(defaultLabelMap("ADR")).toBe("ADRESS")
  })
  it("upper-cases unknown groups so third-party models pass through", () => {
    expect(defaultLabelMap("misc")).toBe("MISC")
  })
  it("constrains unknown groups to a placeholder-safe charset", () => {
    // A hostile group must not be able to inject bracket/placeholder syntax
    // into redacted output.
    expect(defaultLabelMap("]...[NAMN_1]")).toBe("NAMN1")
    expect(defaultLabelMap("[PER]")).toBe("PER")
    expect(defaultLabelMap("MISC-TYPE")).toBe("MISC-TYPE")
  })
  it("falls back to PII when nothing safe remains", () => {
    expect(defaultLabelMap("[]...")).toBe("PII")
    expect(defaultLabelMap("!!!")).toBe("PII")
  })
})

describe("custom labelMap", () => {
  it("receives the raw BIO-stripped group, not the Swedish label", () => {
    const seen: string[] = []
    const tokens: RawToken[] = [{ entity: "B-PER", score: 0.99, index: 1, word: "Lars" }]
    const detections = reconstruct(
      "Lars är här.",
      tokens,
      (group) => {
        seen.push(group)
        return defaultLabelMap(group)
      },
      0.5,
    )
    expect(seen).toContain("PER")
    expect(detections).toEqual([{ start: 0, end: 4, value: "Lars", label: "NAMN" }])
  })
})

/** A fake recognizer so we can test the merge logic without loading a model. */
function fakeRecognizer(detections: (text: string) => Detection[]): NerRecognizer {
  return {
    ready: Promise.resolve(),
    detect: async (text) => detections(text),
  }
}

describe("clinicalPrecisionFilter", () => {
  it.each([
    "Blodtryck 180/110",
    "temp 38",
    "GCS 14",
    "Kreatinin 88",
    "puls 112",
    "vårdas avd 6",
    "Mottagning 2",
    "troponin x3",
    "Vfu huvudtrauma",
    "dietist",
    "pneumoni",
  ])("drops the model false positive %s", (value) => {
    const detection = { start: 0, end: value.length, value, label: "ADRESS" }
    expect(clinicalPrecisionFilter(detection, value, "model")).toBe(false)
  })

  it("drops a medication plus dose only when a clinical unit follows", () => {
    const value = "Metformin 500"
    const detection = { start: 0, end: value.length, value, label: "ADRESS" }
    expect(clinicalPrecisionFilter(detection, `${value} mg`, "model")).toBe(false)
    expect(clinicalPrecisionFilter(detection, `${value} patienter`, "model")).toBe(true)
  })

  it("never suppresses a deterministic rule detection", () => {
    const value = "temp 38"
    const detection = { start: 0, end: value.length, value, label: "CUSTOM" }
    expect(clinicalPrecisionFilter(detection, value, "rule")).toBe(true)
  })
})

describe("redactWithNer", () => {
  it("merges NER detections with rule detectors", async () => {
    const input = "Min granne Lars mejlar lars@example.com."
    const recognizer = fakeRecognizer((t) => {
      const start = t.indexOf("Lars")
      return [{ start, end: start + 4, value: "Lars", label: "NAMN" }]
    })

    const { text } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Min granne [NAMN_1] mejlar [EPOST_1].")
  })

  it("lets rule detections win on overlap (earliest+longest)", async () => {
    const input = "Maila lars@example.com nu."
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

  it("hybrid default masks addresses and lägenhetsnummer by rule, even if the model misses", async () => {
    const recognizer = fakeRecognizer(() => []) // model sees nothing
    const { text } = await redactWithNer("Leverans till Påhittsgatan 12, lgh 1201 imorgon.", {
      recognizer,
    })
    expect(text).toBe("Leverans till [ADRESS_1], [LAGENHETSNUMMER_1] imorgon.")
  })

  it("hybrid default masks a context-labeled domestic account number", async () => {
    const recognizer = fakeRecognizer(() => [])
    const { text, redactions } = await redactWithNer(
      "Utbetalning till konto 3300-0032 3232 3232 idag.",
      { recognizer },
    )
    expect(text).toBe("Utbetalning till konto [KONTONUMMER_1] idag.")
    expect(redactions.map((r) => r.label)).toEqual(["KONTONUMMER"])
  })

  it("hybrid default does NOT include regnummer (booking-code shape stays opt-in)", async () => {
    const recognizer = fakeRecognizer(() => [])
    const { text } = await redactWithNer("Bokningskod ABC123 gäller fortfarande.", { recognizer })
    expect(text).toBe("Bokningskod ABC123 gäller fortfarande.")
  })

  it("the address rule guarantees the house number inside the mask when the model splits it", async () => {
    const input = "Bor på Påhittsgatan 12 i Umeå."
    // Model tags only the street name, leaving the house number outside.
    const recognizer = fakeRecognizer((t) => {
      const start = t.indexOf("Påhittsgatan")
      return [{ start, end: start + "Påhittsgatan".length, value: "Påhittsgatan", label: "ADRESS" }]
    })
    const { text, redactions } = await redactWithNer(input, { recognizer })
    expect(text).not.toContain("12")
    expect(redactions.some((r) => r.label === "ADRESS" && r.value === "Påhittsgatan 12")).toBe(true)
  })

  it("repairs a street-like PLATS span and includes its trailing house number", async () => {
    const input = "Cykeln stod vid Årstagången 14."
    const recognizer = fakeRecognizer((text) => {
      const start = text.indexOf("Årstagången")
      return [{ start, end: start + 11, value: "Årstagången", label: "PLATS" }]
    })
    const { text, redactions } = await redactWithNer(input, { recognizer, detectors: [] })
    expect(text).toBe("Cykeln stod vid [ADRESS_1].")
    expect(redactions).toEqual([
      expect.objectContaining({ label: "ADRESS", value: "Årstagången 14" }),
    ])
  })

  it("corrects a lowercase known locality mislabeled as an organisation", async () => {
    const input = "dä ä Inga-Maj från skellefteå som ringer"
    const recognizer = fakeRecognizer((text) => {
      const start = text.indexOf("skellefteå")
      return [{ start, end: start + 10, value: "skellefteå", label: "ORGANISATION" }]
    })
    const { redactions } = await redactWithNer(input, { recognizer, detectors: [] })
    expect(redactions).toEqual([expect.objectContaining({ label: "PLATS", value: "skellefteå" })])
  })

  it('profile: "clinical" keeps names and rules but drops measurements and doses', async () => {
    const journalId = "TEST-JOURNAL-01"
    const input = `Patient Karl Bergström, tel 070-174 06 58. Blodtryck 180/110. Ordination Lisinopril 10 mg. Journalnummer ${journalId}.`
    const recognizer = fakeRecognizer((text) => {
      const detection = (value: string, label: string): Detection => {
        const start = text.indexOf(value)
        return { start, end: start + value.length, value, label }
      }
      return [
        detection("Karl Bergström", "NAMN"),
        detection("Blodtryck 180/110", "ADRESS"),
        detection("Lisinopril 10", "ADRESS"),
        detection(`Journalnummer ${journalId}`, "ADRESS"),
      ]
    })
    const { text, redactions } = await redactWithNer(input, {
      recognizer,
      profile: "clinical",
    })
    expect(text).toContain("Patient [NAMN_1]")
    expect(text).toContain("tel [TELEFON_1]")
    expect(text).toContain("Blodtryck 180/110")
    expect(text).toContain("Lisinopril 10 mg")
    expect(text).toContain("Journalnummer [JOURNALNUMMER_1]")
    expect(redactions.map((r) => r.label).sort()).toEqual(["JOURNALNUMMER", "NAMN", "TELEFON"])
  })

  it("keeps the general default unchanged when profile is omitted", async () => {
    const value = "Blodtryck 180/110"
    const recognizer = fakeRecognizer(() => [
      { start: 0, end: value.length, value, label: "ADRESS" },
    ])
    const { text } = await redactWithNer(value, { recognizer, detectors: [] })
    expect(text).toBe("[ADRESS_1]")
  })

  it("composes a custom detection filter with the selected profile", async () => {
    const input = "Blodtryck 180/110 hos Karl Bergström"
    const recognizer = fakeRecognizer((text) => {
      const detection = (value: string): Detection => {
        const start = text.indexOf(value)
        return { start, end: start + value.length, value, label: "NAMN" }
      }
      return [detection("Blodtryck 180/110"), detection("Karl Bergström")]
    })
    const { text } = await redactWithNer(input, {
      recognizer,
      detectors: [],
      profile: "clinical",
      detectionFilter: (detection) => detection.value !== "Karl Bergström",
    })
    expect(text).toBe(input)
  })

  it("explicit detectors option still overrides the hybrid default entirely", async () => {
    const recognizer = fakeRecognizer(() => [])
    const { text } = await redactWithNer("Bor på Påhittsgatan 12.", {
      recognizer,
      detectors: [],
    })
    expect(text).toBe("Bor på Påhittsgatan 12.")
  })

  it("clips a model span that glues a name to the e-mail local-part (name must not leak)", async () => {
    const input = "Kontakt: Anna Karlsson anna.karlsson@example.com snarast"
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
    const input = "Konto IBAN SE4280000890119146168423 men ring Lars."
    // The model wrongly tags digit chunks of the IBAN as addresses, and a name.
    const recognizer = fakeRecognizer((t) => {
      const i = t.indexOf("SE42")
      const lars = t.indexOf("Lars")
      return [
        { start: t.indexOf("IBAN"), end: i + 4, value: "IBAN SE42", label: "ADR" },
        { start: i + 6, end: i + 12, value: "000000", label: "ADR" },
        { start: lars, end: lars + 4, value: "Lars", label: "PER" },
      ]
    })
    const { text, redactions } = await redactWithNer(input, { recognizer })
    expect(text).toBe("Konto IBAN [IBAN_1] men ring [PER_1].")
    expect(redactions.map((r) => r.label).sort()).toEqual(["IBAN", "PER"])
  })

  it("clips several rule spans out of one model span, keeping the gaps between", async () => {
    const input = "Anna 070-174 06 58 Karlsson anna@example.com Berg"
    // One model span over the whole sentence; the phone and e-mail rules take
    // their parts, the three name fragments must survive as separate spans.
    const recognizer = fakeRecognizer((t) => [{ start: 0, end: t.length, value: t, label: "NAMN" }])
    const { text, restore } = await redactWithNer(input, { recognizer })
    expect(text).toBe("[NAMN_1] [TELEFON_1] [NAMN_2] [EPOST_1] [NAMN_3]")
    expect(restore(text)).toBe(input)
  })

  it("clips many rule spans out of wide model spans in linear time", async () => {
    // Clipping used to re-walk the whole segment list for every rule span,
    // and that list grows by one per overlapping rule: quadratic in the rule
    // count under one model span. Measured before the fix on a 79 kB log with
    // 4k e-mail detections and 50 document-wide model spans: 3.3 s of blocked
    // event loop, quadrupling when the log doubled.
    const input = Array.from({ length: 4000 }, (_, i) => `anv${i}@example.com`).join(" ")
    const recognizer = fakeRecognizer((t) => [{ start: 0, end: t.length, value: t, label: "NAMN" }])
    const started = performance.now()
    const { text, restore } = await redactWithNer(input, { recognizer })
    // ~30 ms after the fix, ~3.3 s before it (with 50 spans; one span here
    // still forced the quadratic walk). A generous ceiling so this is a
    // regression guard rather than a benchmark.
    expect(performance.now() - started).toBeLessThan(2000)
    expect(text).not.toContain("@example.com")
    expect(restore(text)).toBe(input)
  })
})
