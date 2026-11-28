import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The public pages share one monochrome design: two corner radii, one tab
 * look, one data table, no decorative pills and no accent colour in the UI
 * shell. Colour belongs to the PII placeholders (labels.ts) and to code
 * syntax highlighting only. These checks keep the old variants (999px pills,
 * green status dots, the blue accuracy accent, per-page tables) from coming
 * back.
 */
const root = resolve(__dirname, "..", "src")
const css = readFileSync(resolve(root, "styles.css"), "utf8")

/** Top-level and media-nested rules as [selector, body] pairs. */
function rules(source: string): [string, string][] {
  const out: [string, string][] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(pattern)) {
    out.push([match[1].trim(), match[2]])
  }
  return out
}

const ALLOWED_RADII = new Set([
  "var(--radius)",
  "var(--radius-token)",
  "50%",
  "0",
  "var(--radius) var(--radius) 0 0",
  "0 0 var(--radius) var(--radius)",
])

// Greens and the old blue accent. Syntax highlighting (.tok-*) may use them.
const ACCENT_HEXES = [
  "#166534",
  "#15803d",
  "#16a34a",
  "#22c55e",
  "#4ade80",
  "#10b981",
  "#bbe3c8",
  "#f0faf3",
  "#1d4ed8",
  "#5e82e8",
]

describe("design system guard", () => {
  it("uses only the two corner radii (no 999px pills)", () => {
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1].trim())
    const unknown = radii.filter((value) => !ALLOWED_RADII.has(value))
    expect(unknown, "use var(--radius) or var(--radius-token)").toEqual([])
  })

  it("keeps accent colours out of the UI shell", () => {
    const offenders = rules(css)
      .filter(([selector]) => !/\.tok-[a-z]/.test(selector))
      .filter(([, body]) => ACCENT_HEXES.some((hex) => body.toLowerCase().includes(hex)))
      .map(([selector]) => selector)
    expect(offenders, "colour lives in labels.ts placeholders and .tok-* syntax only").toEqual([])
    expect(css).not.toMatch(/--ok\b|--bench-accent/)
  })

  it("renders every table with a header row through the shared .data-table", () => {
    const dir = resolve(root, "components")
    const offenders = readdirSync(dir)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) => {
        const source = readFileSync(resolve(dir, file), "utf8")
        if (!source.includes("<thead")) return []
        const tables = [...source.matchAll(/<table\b[^>]*>/g)].map((m) => m[0])
        return tables.filter((tag) => !tag.includes('"data-table"')).map((tag) => `${file}: ${tag}`)
      })
    expect(offenders).toEqual([])
  })

  it("sets labels in sentence case, never uppercase or letter-spaced", () => {
    // Joel 2026-11-26: "DIN TEXT"-style eyebrows read as noise. Labels,
    // table heads, the TOC and footer headings are plain sentence case.
    expect(css, "write the label in sentence case instead").not.toMatch(
      /text-transform:\s*uppercase/,
    )
    const spaced = rules(css)
      .filter(([, body]) => /letter-spacing:\s*0?\.\d*[1-9]/.test(body))
      .map(([selector]) => selector)
    expect(spaced, "only negative tracking (tight headings) is allowed").toEqual([])
  })

  it("keeps prose element styles out of the product windows", () => {
    // The hero scenes also sit inside prose on the product page; bare
    // .prose li/strong/code/pre rules gave them bullets, invisible bold text
    // and a dark code block there (2026-11-27).
    const offenders = rules(css)
      .flatMap(([selector]) => selector.split(","))
      .map((selector) => selector.trim())
      .filter((selector) => /^\.prose (ul|li|strong|code|pre)\b/.test(selector))
      .filter((selector) => !selector.includes(":not(:where(.hero-window *))"))
    expect(offenders, "add :not(:where(.hero-window *)) to prose element rules").toEqual([])
  })

  it("keeps monospace to code the reader copies", () => {
    // Joel 2026-11-26: no monospace in the UI; terminal and code blocks keep
    // it. Placeholders, demo text and labels use the sans face.
    const MONO_SELECTORS = new Set([
      ".footer code",
      ".prose code:not(:where(.hero-window *))",
      ".prose pre:not(:where(.hero-window *)) code",
      ".hero-code pre",
    ])
    const offenders = rules(css)
      .filter(([, body]) => body.includes("var(--mono)"))
      .map(([selector]) => selector)
      .filter((selector) => !MONO_SELECTORS.has(selector))
    expect(offenders, "use var(--sans); monospace is for code blocks only").toEqual([])
  })

  it("never dims .output.analyzing or mask-token-in opacity below 1 (preserves WCAG AA contrast)", () => {
    const analyzingRule = rules(css).find(([selector]) => selector === ".output.analyzing")
    expect(analyzingRule?.[1] ?? "").not.toMatch(/opacity\s*:/)
    const tokenAnim = css.match(/@keyframes\s+mask-token-in\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(tokenAnim).not.toMatch(/opacity\s*:/)
  })

  it("puts the page navigation in one rail, right of the content, on every page", () => {
    const body = (selector: string) =>
      rules(css)
        .filter(([sel]) => sel === selector)
        .map(([, b]) => b)
        .join("")
    // 720px article + 48px gap + 224px rail = the 992px container: the rail
    // ends where the header and footer end.
    expect(body(".prose-with-toc > .toc-rail")).toMatch(/left:\s*calc\(100% \+ 48px\)/)
    expect(body(".prose-with-toc > .toc-rail")).toMatch(/width:\s*224px/)
    // Every page with a TOC uses that one rail, never its own column layout.
    const components = resolve(root, "components")
    const offenders = readdirSync(components)
      .filter((file) => file.endsWith(".tsx") && file !== "PageToc.tsx")
      .filter((file) => {
        const source = readFileSync(resolve(components, file), "utf8")
        return (
          source.includes("<PageToc") && !/<article className="[^"]*prose-with-toc/.test(source)
        )
      })
    expect(offenders, 'render <PageToc> inside <article className="prose prose-with-toc">').toEqual(
      [],
    )
  })

  it("makes every code block focusable so a keyboard can scroll a long line", () => {
    // axe scrollable-region-focusable: a <pre> scrolls sideways on a phone.
    const components = resolve(root, "components")
    const unfocusable = readdirSync(components)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) =>
        [...readFileSync(resolve(components, file), "utf8").matchAll(/<pre\b[^>]*>/g)]
          .filter((match) => !/tabIndex=\{0\}/.test(match[0]))
          .map((match) => `${file}: ${match[0]}`),
      )
    expect(unfocusable, "give the <pre> tabIndex={0}, or render it with CodeSnippet").toEqual([])
  })

  it("uses only custom properties the stylesheet defines", () => {
    // An undefined var() silently falls back (a transparent box, a full-ink
    // underline). The --pii-* colours are set inline per label by labels.ts.
    const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
    const defined = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
    const undefinedVars = [
      ...new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])),
    ].filter((name) => !defined.has(name) && !name.startsWith("--pii-"))
    expect(
      undefinedVars,
      "define the token in :root and the dark theme, or use an existing one",
    ).toEqual([])
  })

  it("casts the hero window shadow once, from the stage, never from the crossfading scenes", () => {
    // Two scene shadows stack while the scenes crossfade, so the halo under
    // the window darkens and then snaps back when the outgoing scene hides.
    const body = (selector: string) =>
      rules(css)
        .filter(([sel]) => sel.split(",").some((part) => part.trim() === selector))
        .map(([, b]) => b)
        .join("")
    expect(body(".hero-stage")).toMatch(/box-shadow:\s*var\(--hero-window-shadow\)/)
    expect(body(".hero-stage-scene > .hero-window")).toMatch(/box-shadow:\s*none/)
    const sceneShadows = rules(css)
      .filter(([selector]) => /\.hero-stage-scene/.test(selector))
      .filter(([, b]) => /box-shadow:(?!\s*none)/.test(b))
      .map(([selector]) => selector)
    expect(sceneShadows, "put the shadow on .hero-stage, not on a scene").toEqual([])
  })
})
