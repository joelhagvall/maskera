import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
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

  it("labels the Markdown siblings text/markdown", () => {
    const rule = vercel.headers.find((h) => h.source === "/(.*)\\.md")
    expect(rule?.headers).toContainEqual({
      key: "Content-Type",
      value: "text/markdown; charset=utf-8",
    })
  })
})

describe("robots.txt", () => {
  const robots = read("public/robots.txt")
  // RFC 9309: consecutive User-agent lines share the rules that follow them.
  const groups = robots
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").filter((line) => !line.startsWith("#")))
    .filter((lines) => lines.some((line) => line.startsWith("User-agent:")))
    .map((lines) => ({
      agents: lines.filter((l) => l.startsWith("User-agent:")).map((l) => l.slice(11).trim()),
      rules: lines.filter((l) => !l.startsWith("User-agent:")),
    }))
  const groupFor = (agent: string) =>
    groups.find((group) => group.agents.includes(agent)) ??
    groups.find((group) => group.agents.includes("*"))

  it("blocks AI training crawlers", () => {
    for (const agent of ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot"]) {
      expect(groupFor(agent)?.rules, agent).toContain("Disallow: /")
    }
  })

  it("lets search and AI answer crawlers in", () => {
    for (const agent of [
      "Googlebot",
      "Bingbot",
      "OAI-SearchBot",
      "Claude-SearchBot",
      "PerplexityBot",
    ]) {
      expect(groupFor(agent)?.agents, agent).toEqual(["*"])
      expect(groupFor(agent)?.rules, agent).toContain("Allow: /")
    }
  })

  it("states the same content signal in every group", () => {
    for (const group of groups) {
      expect(group.rules).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no")
    }
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
      expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${sv}" />`)
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

  it("points at the browser extension, @maskera/mcp, the Markdown renderings and the about page", () => {
    expect(llms).toContain("https://maskera.dev/tjanster")
    expect(llms).toContain("https://app.maskera.dev")
    expect(llms).toContain("@maskera/mcp")
    expect(llms).toContain("npx -y @maskera/mcp proxy")
    expect(llms).not.toContain("Gateway")
    expect(llms).not.toContain("gateway")
    expect(llms).toContain("Accept: text/markdown")
    expect(llms).toContain("https://maskera.dev/index.md")
    expect(llms).toContain("https://maskera.dev/en/about")
    expect(llms).toContain("https://maskera.dev/en/security")
    expect(llms).toContain("https://maskera.dev/sakerhet")
    expect(llms).toContain("packages/mcp/AUDIT.md")
    expect(llms).toContain("packages/mcp/audit-results.json")
    expect(llms).toContain("hej@maskera.dev")
  })

  it("keeps shared protected words and MDM in Team, not Pro", () => {
    // The portal answers 403 for Pro on shared words (maskera-cloud 33cd2d5).
    expect(llms).toContain("Team at SEK 249/user/month excl. VAT")
    for (const line of llms.split("\n").filter((l) => l.includes("Pro at SEK"))) {
      const pro = line.slice(line.indexOf("Pro at SEK"), line.indexOf("Team at SEK"))
      expect(pro).not.toMatch(/shared|MDM/)
    }
  })
})

describe("index.html", () => {
  const html = read("index.html")
  const jsonLd = JSON.parse(
    html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1] ?? "null",
  ) as { "@graph": Record<string, unknown>[] }

  it("gives the Organization a contactPoint and address", () => {
    const website = jsonLd["@graph"].find((node) => node["@type"] === "WebSite") as {
      name: string
      url: string
    }
    expect(website).toMatchObject({ name: "maskera", url: "https://maskera.dev/" })

    const app = jsonLd["@graph"].find((node) => node["@type"] === "WebApplication") as {
      sameAs: string[]
    }
    expect(app.sameAs).toContain("https://www.npmjs.com/package/@maskera/mcp")

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

  it("links the manifest and a localized link-preview card", () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<meta property="og:image" content="https://maskera.dev/og.png" />')
    expect(html).toMatch(/property="og:image:alt"\s+content="[^"]+"/)
    for (const file of ["og.png", "og-en.png", "manifest.webmanifest", "manifest-en.webmanifest"]) {
      expect(existsSync(resolve(__dirname, "..", "public", file)), file).toBe(true)
    }
  })

  it("keeps both manifests installable and pointing at existing icons", () => {
    for (const [file, start] of [
      ["manifest.webmanifest", "/"],
      ["manifest-en.webmanifest", "/en"],
    ] as const) {
      const manifest = JSON.parse(read(`public/${file}`)) as {
        name: string
        start_url: string
        display: string
        icons: { src: string; sizes: string; purpose?: string }[]
      }
      expect(manifest.start_url).toBe(start)
      expect(manifest.display).toBe("standalone")
      expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true)
      expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true)
      for (const icon of manifest.icons) {
        expect(existsSync(resolve(__dirname, "..", "public", icon.src.slice(1))), icon.src).toBe(
          true,
        )
      }
    }
  })

  it("advertises the Markdown alternate", () => {
    expect(html).toContain('<link rel="alternate" type="text/markdown" href="/index.md" />')
  })
})
