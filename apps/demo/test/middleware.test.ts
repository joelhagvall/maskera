import { describe, expect, it } from "vitest"
import middleware, { config } from "../middleware"
import { ALIAS_REDIRECTS, markdownPathFor, PAGE_PATHS } from "../src/paths"

const ORIGIN = "https://maskera.dev"

function call(path: string, init: { accept?: string | null; method?: string } = {}) {
  const headers = new Headers()
  if (init.accept !== undefined && init.accept !== null) headers.set("accept", init.accept)
  return middleware(new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers }))
}

const BROWSER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"

describe("middleware config", () => {
  it("skips hashed assets, fonts, model weights and the ONNX runtime", () => {
    expect(config.matcher).toEqual(["/((?!assets/|models/|fonts/|ort/).*)"])
  })
})

describe("Markdown content negotiation (acceptmarkdown.com)", () => {
  for (const page of PAGE_PATHS) {
    it(`${page}: Accept: text/markdown rewrites to ${markdownPathFor(page)}`, () => {
      const response = call(page, { accept: "text/markdown" })
      expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}${markdownPathFor(page)}`)
      expect(response.headers.get("vary")).toBe("Accept")
      expect(response.headers.get("content-location")).toBe(markdownPathFor(page))
    })
  }

  it("honours q-values and specificity when picking markdown", () => {
    const preferred = call("/utvecklare", { accept: "text/html;q=0.5, text/markdown;q=0.9" })
    expect(preferred.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/utvecklare.md`)
    const rejectedHtml = call("/utvecklare", { accept: "*/*, text/html;q=0" })
    expect(rejectedHtml.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/utvecklare.md`)
  })

  it("serves HTML to browsers and advertises the Markdown alternate with Vary: Accept", () => {
    for (const accept of [BROWSER, null, "*/*", "text/html, text/markdown"]) {
      const response = call("/", { accept })
      expect(response.headers.get("x-middleware-next")).toBe("1")
      expect(response.headers.get("x-middleware-rewrite")).toBeNull()
      expect(response.headers.get("vary")).toBe("Accept")
      expect(response.headers.get("link")).toBe(
        '</index.md>; rel="alternate"; type="text/markdown"',
      )
    }
  })

  it("normalises trailing slashes before matching a page", () => {
    const response = call("/en/developers/", { accept: "text/markdown" })
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${ORIGIN}/en/developers.md`)
  })

  it("answers 406 with the available types when Accept rules out both", async () => {
    const response = call("/en", { accept: "application/json" })
    expect(response.status).toBe(406)
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(response.headers.get("vary")).toBe("Accept")
    const body = await response.json()
    expect(body.error.code).toBe("not_acceptable")
    expect(body.error.available).toEqual(["text/html", "text/markdown"])
  })

  it("leaves non-GET page requests to the platform", () => {
    const response = call("/", { accept: "text/markdown", method: "POST" })
    expect(response.headers.get("x-middleware-next")).toBe("1")
    expect(response.headers.get("x-middleware-rewrite")).toBeNull()
  })
})

describe("pass-through", () => {
  const files = [
    "/index.md",
    "/en/developers.md",
    "/llms.txt",
    "/sitemap.xml",
    "/robots.txt",
    "/whitepaper.pdf",
    "/benchmark-release.json",
    "/openapi.json",
    "/favicon.ico",
    "/og.png",
    "/theme-init.js",
  ]
  for (const file of files) {
    it(`${file} continues untouched`, () => {
      const response = call(file, { accept: "text/markdown" })
      expect(response.headers.get("x-middleware-next")).toBe("1")
      expect(response.headers.get("x-middleware-rewrite")).toBeNull()
      expect(response.headers.get("vary")).toBeNull()
    })
  }

  for (const alias of Object.keys(ALIAS_REDIRECTS)) {
    it(`${alias} is left to the vercel.json redirect`, () => {
      const response = call(alias, { accept: "text/markdown" })
      expect(response.headers.get("x-middleware-next")).toBe("1")
      expect(response.status).toBe(200)
    })
  }
})

describe("agent-friendly 404s", () => {
  it("defaults to a Markdown body that points at llms.txt, the sitemap, docs and the OpenAPI contract", async () => {
    for (const accept of [null, "*/*", "text/markdown"]) {
      const response = call("/some-path-that-does-not-exist", { accept })
      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
      expect(response.headers.get("vary")).toBe("Accept")
      expect(response.headers.get("x-robots-tag")).toBe("noindex")
      const body = await response.text()
      expect(
        body.startsWith("# 404: nothing at /some-path-that-does-not-exist on maskera.dev"),
      ).toBe(true)
      for (const link of [
        "https://maskera.dev/llms.txt",
        "https://maskera.dev/sitemap.xml",
        "https://maskera.dev/en/developers",
        "https://maskera.dev/openapi.json",
        "https://maskera.dev/en/about",
        "Accept: text/markdown",
      ]) {
        expect(body).toContain(link)
      }
    }
  })

  it("returns structured JSON for API-style clients and for anything under /api/", async () => {
    for (const [path, accept] of [
      ["/missing", "application/json"],
      ["/api/v1/mask", null],
      ["/api", BROWSER],
      ["/api/anything", "text/markdown"],
    ] as const) {
      const response = call(path, { accept })
      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8")
      const body = await response.json()
      expect(body.error.code).toBe("not_found")
      expect(body.error.status).toBe(404)
      expect(body.error.message).toContain(path)
      expect(body.error.hint).toContain("no HTTP masking API")
      expect(body.error.links.openapi).toBe("https://maskera.dev/openapi.json")
      expect(body.error.links.llms).toBe("https://maskera.dev/llms.txt")
    }
  })

  it("gives browsers a localized HTML page", async () => {
    const sv = call("/finns-inte", { accept: BROWSER })
    expect(sv.status).toBe(404)
    expect(sv.headers.get("content-type")).toBe("text/html; charset=utf-8")
    const svBody = await sv.text()
    expect(svBody).toContain('<html lang="sv">')
    expect(svBody).toContain("Sidan finns inte")
    expect(svBody).toContain('href="/om"')

    const en = call("/en/does-not-exist", { accept: BROWSER })
    const enBody = await en.text()
    expect(enBody).toContain('<html lang="en">')
    expect(enBody).toContain("Page not found")
    expect(enBody).toContain('href="/en/about"')
  })

  it("escapes the requested path before echoing it", async () => {
    const response = call("/%3Cscript%3Ealert(1)%3C/script%3E", { accept: BROWSER })
    const body = await response.text()
    expect(body).not.toContain("<script>")
    expect(body).toContain("scriptalert(1)/script")
  })

  it("answers HEAD without a body but with the same status and headers", async () => {
    const response = call("/nothing-here", { accept: "text/markdown", method: "HEAD" })
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await response.text()).toBe("")
  })

  it("never serves a 200 app shell for an unknown path", () => {
    for (const path of ["/unknown", "/en/unknown", "/utvecklare/unknown", "/docs/unknown"]) {
      expect(call(path, { accept: BROWSER }).status).toBe(404)
    }
  })
})
