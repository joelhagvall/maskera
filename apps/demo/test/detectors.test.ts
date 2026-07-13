import { redact } from "@maskera/core"
import { describe, expect, it } from "vitest"
import { demoDetectors, namn, ruleDetectors } from "../src/detectors"

/**
 * The name gazetteer is demo-only (production names come from the NER model),
 * so it gets the same treatment as core's detectors: a few positives, and a
 * bias toward negatives, since substring hits ("Björn" in "björnbär") are the
 * failure mode that would quietly mangle demo output.
 */

const values = (text: string) => namn.detect(text).map((d) => d.value)

describe("namn gazetteer: matches", () => {
  it("full name is one span, not two", () => {
    expect(values("igår ringde Anna Karlsson hit")).toEqual(["Anna Karlsson"])
  })

  it("standalone first name", () => {
    expect(values("prata med Anna imorgon")).toEqual(["Anna"])
  })

  it("standalone last name", () => {
    expect(values("familjen Bergström flyttade")).toEqual(["Bergström"])
  })

  it("hyphenated last name", () => {
    expect(values("Hassan Al-Rashid deltog")).toEqual(["Hassan Al-Rashid"])
  })

  it("multiple names in one text, in order", () => {
    expect(values("Anna mötte Lars och Sara")).toEqual(["Anna", "Lars", "Sara"])
  })

  it("name followed by punctuation", () => {
    expect(values("Hej Anna!")).toEqual(["Anna"])
  })
})

describe("namn gazetteer: must not match", () => {
  const negatives = [
    ["name inside a longer word", "Perssons bageri har öppet"],
    ["name as lowercase substring", "jag plockade björnbär i skogen"],
    ["lowercase word that is also a name", "en gammal ek i parken"],
    ["lowercase berg", "uppför ett berg i norr"],
    ["name glued into an identifier", "ordernummer ANNA123 skickades"],
    ["genitive of a short name", "Pers cykel står kvar"],
  ] as const

  for (const [name, text] of negatives) {
    it(name, () => {
      expect(values(text)).toEqual([])
    })
  }
})

describe("detector sets", () => {
  it("demoDetectors includes the gazetteer, ruleDetectors does not", () => {
    expect(demoDetectors.some((d) => d.label === "NAMN")).toBe(true)
    expect(ruleDetectors.some((d) => d.label === "NAMN")).toBe(false)
  })

  it("redact with demoDetectors masks name, address and personnummer together", () => {
    const text = "Anna Karlsson, Storgatan 12, pnr 19900101-2385"
    const result = redact(text, { detectors: demoDetectors })
    const labels = result.redactions.map((r) => r.label)
    expect(labels).toContain("NAMN")
    expect(labels).toContain("ADRESS")
    expect(labels).toContain("PERSONNUMMER")
    expect(result.text).not.toContain("Anna")
    expect(result.text).not.toContain("Storgatan")
    expect(result.text).not.toContain("2385")
  })

  it("redact with ruleDetectors leaves free-text names for the model", () => {
    const text = "Anna Karlsson har pnr 19900101-2385"
    const result = redact(text, { detectors: ruleDetectors })
    expect(result.text).toContain("Anna Karlsson")
    expect(result.text).toContain("[PERSONNUMMER_1]")
  })
})
