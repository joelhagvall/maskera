import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { OPENAPI_CANONICAL } from "../src/agent-responses"
import { ALIAS_REDIRECTS, PAGE_PATHS, pathsByLocale } from "../src/paths"

/**
 * src/paths.ts is the one route list; these tests keep every hand-maintained
 * carrier (vercel.json, sitemap.xml, the a11y route loop, llms.txt and the
 * Swedish index.html) in step with it so a new page or alias cannot ship
 * half-wired.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8")
const vercel = JSON.parse(read("vercel.json")) as {
  redirects: { source: string; destination: string; permanent?: boolean }[]
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

describe("vercel.json", () => {
  it("rewrites every sub-page to its prerendered shell", () => {
    for (const page of PAGE_PATHS) {
      if (page === "/") continue
      expect(vercel.rewrites).toContainEqual({ source: page, destination: `${page}/index.html` })
    }
  })

  it("redirects every locale-less alias permanently to its page", () => {
    for (const [source, destination] of Object.entries(ALIAS_REDIRECTS)) {
      expect(vercel.redirects).toContainEqual({ source, destination, permanent: true })
      const target = destination.split("#")[0]
      expect(PAGE_PATHS).toContain(target)
    }
  })

  it("redirects /openapi.json to the canonical Gateway contract", () => {
    expect(vercel.redirects).toContainEqual({
      source: "/openapi.json",
      destination: OPENAPI_CANONICAL,
      permanent: true,
    })
  })

  it("labels the Markdown siblings text/markdown", () => {
    const rule = vercel.headers.find((h) => h.source === "/(.*)\\.md")
    expect(rule?.headers).toContainEqual({
      key: "Content-Type",
      value: "text/markdown; charset=utf-8",
    })
  })
})

describe("sitemap.xml", () => {
  const sitemap = read("public/sitemap.xml")
  const locs = [...sitemap.matchAll(/<loc>https:\/\/maskera\.dev([^<]*)<\/loc>/g)].map((m) =>
    m[1] === "" ? "/" : m[1],
  )

  it("lists every page exactly once and nothing else", () => {
    expect([...locs].sort()).toEqual([...PAGE_PATHS].sort())
  })

  it("pairs each page with its locale alternate", () => {
    for (const view of Object.keys(pathsByLocale.sv) as (keyof typeof pathsByLocale.sv)[]) {
      const sv = `https://maskera.dev${pathsByLocale.sv[view]}`
      const en = `https://maskera.dev${pathsByLocale.en[view]}`
      expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${en}" />`)
      expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="sv" href="${sv}" />`)
    }
  })
})

describe("accessibility route loop", () => {
  it("covers every page", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> }
    for (const script of ["a11y:run", "a11y:review"]) {
      const routes = pkg.scripts[script].match(/for route in ([^;]+);/)?.[1].split(" ") ?? []
      expect([...routes].sort()).toEqual([...PAGE_PATHS].sort())
    }
  })
})

describe("llms.txt", () => {
  const llms = read("public/llms.txt")

  it("names the product and tells agents when and how to use it", () => {
    expect(llms.startsWith("# Maskera (maskera.dev)\n")).toBe(true)
    expect(llms).toContain("## When to use Maskera")
    expect(llms).toContain("## How an agent should call it")
    expect(llms).toContain("## Machine-readable entry points")
  })

  it("points at the OpenAPI contract, the Markdown renderings and the about page", () => {
    expect(llms).toContain("https://maskera.dev/openapi.json")
    expect(llms).toContain(OPENAPI_CANONICAL)
    expect(llms).toContain("Accept: text/markdown")
    expect(llms).toContain("https://maskera.dev/index.md")
    expect(llms).toContain("https://maskera.dev/en/about")
    expect(llms).toContain("hej@maskera.dev")
  })
})

describe("index.html", () => {
  const html = read("index.html")
  const jsonLd = JSON.parse(
    html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? "null",
  ) as { "@graph": Record<string, unknown>[] }

  it("gives the Organization a contactPoint and address", () => {
    const org = jsonLd["@graph"].find((node) => node["@type"] === "Organization") as {
      contactPoint: { email: string; contactType: string }[]
      address: { "@type": string; addressCountry: string }
      email: string
    }
    expect(org.email).toBe("hej@maskera.dev")
    expect(org.address).toMatchObject({ "@type": "PostalAddress", addressCountry: "SE" })
    expect(org.contactPoint.length).toBeGreaterThan(0)
    for (const point of org.contactPoint) {
      expect(point.email).toBe("hej@maskera.dev")
      expect(point.contactType).toBeTruthy()
    }
  })

  it("advertises the Markdown alternate and the OpenAPI service description", () => {
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/index.md" />')
    expect(html).toContain(
      '<link rel="service-desc" type="application/vnd.oai.openapi+json" href="/openapi.json" />',
    )
  })
})
