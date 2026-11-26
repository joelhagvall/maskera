import { describe, expect, it } from "vitest"
import { sampleAiReply } from "../src/components/RestoreDemo"
import { getScenarios } from "../src/scenarios"

/** A map with every token type the scenario replies draw on. */
const MAP: Record<string, string> = {
  "[NAMN_1]": "Bo",
  "[NAMN_2]": "Liv",
  "[NAMN_3]": "Dag",
  "[NAMN_4]": "Kalle Parkinson",
  "[PLATS_1]": "Boden",
  "[ORGANISATION_1]": "Karolinska",
  "[PERSONNUMMER_1]": "640823-3234",
  "[EPOST_1]": "a@example.com",
  "[TELEFON_1]": "0701740632",
  "[KORTNUMMER_1]": "4242 4242 4242 4242",
  "[BANKGIRO_1]": "991-2346",
}

describe("restore demo reply", () => {
  it("gives every example scenario its own reply, not the generic fallback", () => {
    const generic = sampleAiReply(MAP)
    const fallsBack = getScenarios()
      .filter((scenario) => scenario.text !== "")
      .filter((scenario) => sampleAiReply(MAP, scenario.id) === generic)
      .map((scenario) => scenario.id)
    expect(fallsBack, "add a builder to REPLIES in RestoreDemo.tsx").toEqual([])
  })

  it("keeps the ambiguous words of Svensk kontext next to the restored names", () => {
    const reply = sampleAiReply(MAP, "kontext")
    expect(reply).toContain("[NAMN_1] ska bo i [PLATS_1].")
    expect(reply).toContain("[NAMN_2] jobbar på [ORGANISATION_1].")
    expect(reply).toContain("Parkinsons sjukdom")
    expect(reply).toContain("ring tillbaka till [NAMN_4] ([PERSONNUMMER_1]).")
  })

  it("restores the personnummer immediately before NER finishes", () => {
    const reply = sampleAiReply({ "[PERSONNUMMER_1]": "19900101-2385" }, "kontext")
    expect(reply).toContain("[PERSONNUMMER_1]")
    expect(reply).not.toMatch(/\{|undefined|null/)
  })

  it("drops clauses whose tokens the redaction did not produce", () => {
    const reply = sampleAiReply({ "[NAMN_1]": "Bo" }, "kontext")
    expect(reply).not.toMatch(/\{|undefined|null/)
    expect(reply).toContain("Parkinsons sjukdom behöver en ny tid.")
  })
})
