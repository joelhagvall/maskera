import { describe, expect, it } from "vitest"
import { htmlToMarkdown } from "../scripts/html-to-markdown.mjs"
import { renderRoute, routeInfo } from "../src/entry-server"
import { PAGE_PATHS } from "../src/paths"

function markdownFor(pathname: string): string {
  return htmlToMarkdown(renderRoute(pathname), routeInfo(pathname))
}

describe("htmlToMarkdown", () => {
  it("turns the home page into a title, summary and the hero copy without the live demo", () => {
    const md = markdownFor("/")
    expect(md.startsWith("# Skydda personuppgifter innan texten skickas till AI.\n\n> ")).toBe(true)
    expect(md).toContain("Canonical: https://maskera.dev/ (sv)")
    expect(md).toContain("en: https://maskera.dev/en")
    expect(md).toContain("Markdown: https://maskera.dev/index.md")
    expect(md).toContain("https://maskera.dev/llms.txt")
    expect(md).toContain("maskera döljer namn, personnummer och adresser")
    // Interactive regions and chrome are gone
    expect(md).not.toContain("Kandidat: Sara Lindgren")
    expect(md).not.toContain("Hoppa till huvudinnehållet")
    expect(md).not.toContain("Testa ett exempel")
    expect(md).not.toContain("Kopiera")
    // The hero title is emitted once, not three times (sr-only + two aria-hidden copies)
    expect(md.match(/Skydda personuppgifter innan texten skickas till AI\./g)?.length).toBe(1)
    expect(md.length).toBeGreaterThan(500)
  })

  it("keeps headings, lists, tables, code and absolute links on the content pages", () => {
    const accuracy = markdownFor("/traffsakerhet")
    expect(accuracy).toMatch(/^\| .+ \|$/m)
    expect(accuracy).toMatch(/^\| -{3,}/m)

    const dev = markdownFor("/en/developers")
    expect(dev).toContain("```")
    expect(dev).toContain("## ")
    expect(dev).not.toMatch(/\]\(\/[a-z]/)
    expect(dev).toContain("](https://maskera.dev/")

    const about = markdownFor("/en/about")
    expect(about.startsWith("# About Maskera")).toBe(true)
    expect(about).toContain("hej@maskera.dev")
    expect(about).toContain("559598-0110")
  })

  it("produces a substantial document for every page", () => {
    for (const page of PAGE_PATHS) {
      const md = markdownFor(page)
      expect(md.length, page).toBeGreaterThan(500)
      expect(md.startsWith("# "), page).toBe(true)
      expect(md, page).not.toContain("<div")
      expect(md, page).not.toContain("<svg")
    }
  })
})
