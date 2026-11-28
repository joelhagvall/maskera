import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  EXTENSION_BROWSERS,
  heroTargets,
  SUPPORTED_EXTENSION_BROWSERS,
} from "../src/extensionBrowsers"
import * as i18n from "../src/i18n"
import { renderRouteHtml } from "../src/meta"

/**
 * Product facts the site repeats in prose, checked against the one place
 * that owns each of them, so a model release or a store launch cannot leave
 * an old number or an unshipped browser on the page.
 */

const repo = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")
const llms = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8")

/** Every string in a copy tree with its key path. */
function strings(node: unknown, path = ""): { path: string; value: string }[] {
  if (typeof node === "string") return [{ path, value: node }]
  if (Array.isArray(node)) return node.flatMap((item, i) => strings(item, `${path}[${i}]`))
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([key, value]) =>
      strings(value, path ? `${path}.${key}` : key),
    )
  return []
}

const copies = Object.entries(i18n.copies)

describe("training data size", () => {
  // The model card states the attested row counts of the published model.
  const card = repo("training/maskera-sv-ner-card/README.md")
  const rows = Number(card.match(/uses ([\d,]+) generated training rows/)?.[1].replace(/,/g, ""))

  it("is read from the model card", () => {
    expect(rows).toBeGreaterThan(100_000)
  })

  it.each(copies)("matches the model card in %s", (_locale, copy) => {
    const shown = copy.transparency.training.syntheticBody.match(/(\d{1,3}(?:[ , ]\d{3})+)/)?.[1]
    expect(Number(shown?.replace(/[ , ]/g, ""))).toBe(rows)
  })
})

describe("offline model download", () => {
  const revision = repo("packages/ner/src/index.ts").match(
    /MASKERA_SV_NER_REVISION = "([0-9a-f]{40})"/,
  )?.[1]

  it.each(copies)(
    "pins every hf download to the package's model revision in %s",
    (_locale, copy) => {
      const downloads = strings(copy).filter(({ value }) => value.includes("hf download"))
      expect(downloads.length).toBeGreaterThan(0)
      for (const { path, value } of downloads)
        expect(value, path).toContain(`--revision ${revision}`)
    },
  )
})

describe("browsers the extension runs in", () => {
  // A browser counts as supported once its hero button links to a store.
  const unshipped = heroTargets(EXTENSION_BROWSERS)
    .filter(({ visitor, storeUrl }) => visitor !== "mobile" && !storeUrl)
    .map(({ visitor }) => EXTENSION_BROWSERS.find(({ id }) => id === visitor))
    .filter((browser) => browser !== undefined)
  const LATER = /senare|snart|later|soon/i
  /** Sentences that name the browser without saying it comes later. */
  const claimsFor = (text: string, name: string) =>
    text.split(/(?<=[.;!?])\s+|\n/).filter((s) => s.includes(name) && !LATER.test(s))

  it.each(copies)("are never claimed for an unshipped browser in %s", (locale, copy) => {
    for (const browser of unshipped) {
      const name = copy.extensionInstall.browsers[browser.id].name
      const claims = strings(copy).filter(
        ({ path, value }) =>
          !path.startsWith("extensionInstall.browsers.") && claimsFor(value, name).length > 0,
      )
      expect(claims, `${locale}: ${name} has no store listing yet`).toEqual([])
    }
  })

  it("are never claimed for an unshipped browser in the services page's structured data", () => {
    for (const locale of ["sv", "en"] as const) {
      const operatingSystem = renderRouteHtml("services", locale).match(
        /"operatingSystem": "([^"]*)"/,
      )?.[1]
      expect(operatingSystem).toBe(SUPPORTED_EXTENSION_BROWSERS)
      for (const browser of unshipped) expect(operatingSystem).not.toContain(browser.id.slice(1))
    }
  })

  it.each(copies)(
    "are all named where the services overview says where it runs, in %s",
    (_l, copy) => {
      // The other direction: when a store listing goes live (storeUrl set), the
      // overview, the FAQ, llms.txt and the portal copy must start naming it.
      const runsIn = copy.services.overview.rows[1].values[0]
      for (const name of SUPPORTED_EXTENSION_BROWSERS.split(", ")) expect(runsIn).toContain(name)
    },
  )

  it("are never claimed for an unshipped browser in llms.txt", () => {
    for (const browser of unshipped) {
      const name = i18n.copies.en.extensionInstall.browsers[browser.id].name
      const lines = claimsFor(llms, name)
      expect(lines, `${name} has no store listing yet`).toEqual([])
    }
  })
})
