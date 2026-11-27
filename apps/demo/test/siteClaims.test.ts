import { describe, expect, it } from "vitest"
import { codeExampleClaim, collectSiteClaims } from "../scripts/site-claims.mjs"
import * as scenes from "../src/heroScenes"
import * as i18n from "../src/i18n"

describe("site claims", () => {
  it("collects every masked example the site shows, for check:claims to run through the model", () => {
    const claims = collectSiteClaims({ scenes, i18n })
    const where = claims.map((claim: { where: string }) => claim.where)
    expect(where).toContain("heroScenes HERO_SCENE")
    expect(where).toContain("heroScenes OG_SAMPLE")
    for (const locale of ["sv", "en"]) {
      expect(where).toContain(`${locale} developerApi.codeExample`)
      expect(
        where.filter((w: string) => w.startsWith(`${locale} accuracy.contextExamples`)),
      ).toHaveLength(i18n.copies[locale as "sv" | "en"].accuracy.contextExamples.length)
    }
    for (const claim of claims) expect(claim.masked, claim.where).toMatch(/\[[A-ZÅÄÖ_]+_\d+\]/)
  })

  it("refuses a README example without an input or a // text: line", () => {
    expect(() => codeExampleClaim('redactWithNer("hej")')).toThrow("// text:")
  })
})
