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

  it("never dims .output.analyzing or mask-token-in opacity below 1 (preserves WCAG AA contrast)", () => {
    const analyzingRule = rules(css).find(([selector]) => selector === ".output.analyzing")
    expect(analyzingRule?.[1] ?? "").not.toMatch(/opacity\s*:/)
    const tokenAnim = css.match(/@keyframes\s+mask-token-in\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
    expect(tokenAnim).not.toMatch(/opacity\s*:/)
  })
})
