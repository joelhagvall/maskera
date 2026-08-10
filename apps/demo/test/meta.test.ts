import { describe, expect, it } from "vitest"
import {
  getViewMeta,
  renderRouteHtml,
  routeHtmlViews,
  viewMeta,
  viewPaths,
  viewUrl,
} from "../src/meta"

/**
 * The static sub-page shells are generated from viewMeta, the same data
 * applyViewMeta writes during SPA navigation. These tests pin the contract:
 * whatever a crawler sees on a direct landing is what the client would have
 * set, correctly escaped.
 */
describe("renderRouteHtml", () => {
  for (const view of routeHtmlViews) {
    it(`${viewPaths[view]} carries its viewMeta title, description and canonical`, () => {
      const html = renderRouteHtml(view)
      const url = viewUrl(view)
      expect(html).toContain(`<link rel="canonical" href="${url}" />`)
      expect(html).toContain(`<meta property="og:url" content="${url}" />`)
      // & in "integritet & transparens" must be escaped in attributes/title
      const title = viewMeta[view].title.replace(/&/g, "&amp;")
      expect(html).toContain(`<title>${title}</title>`)
      expect(html).toContain(`<meta property="og:title" content="${title}" />`)
      expect(html).toContain(viewMeta[view].description.replace(/&/g, "&amp;"))
      expect(html).toContain('<script type="module" src="/src/main.tsx"></script>')
    })
  }

  it("escapes the ampersand in the transparency title", () => {
    expect(renderRouteHtml("transparency")).toContain(
      "<title>integritet &amp; transparens · maskera</title>",
    )
  })

  it("embeds valid JSON-LD", () => {
    for (const view of routeHtmlViews) {
      const html = renderRouteHtml(view)
      const match = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)
      expect(match).not.toBeNull()
      const data = JSON.parse(match?.[1] ?? "")
      expect(data.url).toBe(viewUrl(view))
    }
  })

  it("only the developers page preloads its mono font and architecture images", () => {
    expect(renderRouteHtml("dev")).toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("dev")).toContain('href="/layers-sv.svg"')
    expect(renderRouteHtml("dev")).toContain('href="/layers-sv-dark.svg"')
    expect(renderRouteHtml("transparency")).not.toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("transparency")).not.toContain('href="/layers-sv.svg"')
    expect(renderRouteHtml("testdata")).not.toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("privacy")).not.toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("services")).not.toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("accuracy")).not.toContain("geist-mono-latin.woff2")
    expect(renderRouteHtml("security")).not.toContain("geist-mono-latin.woff2")
  })

  it("renders English shells with matching paths, metadata and locale alternates", () => {
    const html = renderRouteHtml("dev", "en")
    const meta = getViewMeta("en").dev

    expect(html).toContain('<html lang="en">')
    expect(html).toContain(`<title>${meta.title}</title>`)
    expect(html).toContain('<link rel="canonical" href="https://maskera.dev/en/developers" />')
    expect(html).toContain(
      '<link rel="alternate" hreflang="sv" href="https://maskera.dev/utvecklare" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://maskera.dev/en/developers" />',
    )
    expect(html).toContain('href="/layers.svg"')
    expect(html).toContain('href="/layers-dark.svg"')
  })
})
