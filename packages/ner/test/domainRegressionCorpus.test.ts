import { readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

type DomainCase = {
  id: string
  kategori: string
  text: string
  forvantad: string[]
}

const RESERVED_PHONE =
  "(?:070(?:[ -]?\\d){7}|031(?:[ -]?\\d){7}|040(?:[ -]?\\d){7}|08(?:[ -]?\\d){7}|0980(?:[ -]?\\d){6})"
const TEST_IDENTITY =
  "(?:19000101-?9801|640823-?3234|781101-?2397|850601-?2387|850623-?2381|900101-?2385|991201-?2391|020301-?2398)"
const PHONE_IN_IDENTITY_FIELD = new RegExp(
  `\\b(?:personnummer|personnr|pnr)\\b[\\s:=()/-]{0,8}${RESERVED_PHONE}`,
  "iu",
)
const IDENTITY_IN_CONTACT_FIELD = new RegExp(
  `\\b(?:ring(?:a)?(?: mig)?(?: på)?|sms:a(?: mig)?(?: på)?|nås?(?: bäst)?(?: på)?|telefon(?:nummer)?|tel|tfn|mobil)\\b[\\s:=()/-]{0,8}${TEST_IDENTITY}`,
  "iu",
)

describe("privacy-safe domain regression corpus", () => {
  it("keeps the tracked baseline complete and internally consistent", async () => {
    const directory = new URL("../eval/domain-regression/corpus/", import.meta.url)
    const files = readdirSync(directory)
      .filter((file) => file.endsWith(".mjs"))
      .sort()
    const corpus: DomainCase[] = []

    for (const file of files) {
      const module = (await import(new URL(file, directory).href)) as {
        default: DomainCase[]
      }
      corpus.push(...module.default)
    }

    expect(files).toHaveLength(13)
    expect(corpus).toHaveLength(258)
    expect(corpus.reduce((sum, test) => sum + test.forvantad.length, 0)).toBe(952)

    const ids = corpus.map((test) => test.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const test of corpus) {
      expect(test.id).not.toBe("")
      expect(test.kategori).not.toBe("")
      expect(test.forvantad.length).toBeGreaterThan(0)
      expect(test.text).not.toMatch(PHONE_IN_IDENTITY_FIELD)
      expect(test.text).not.toMatch(IDENTITY_IN_CONTACT_FIELD)
      for (const expected of test.forvantad) {
        expect(test.text.toLocaleLowerCase("sv-SE")).toContain(expected.toLocaleLowerCase("sv-SE"))
      }
    }
  })
})
