import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import en from "../src/i18n/en.json"
import sv from "../src/i18n/sv.json"

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, `${prefix}[${index}]`))
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      leafPaths(item, prefix ? `${prefix}.${key}` : key),
    )
  }
  return [prefix]
}

function placeholders(value: unknown): string[] {
  if (typeof value !== "string") return []
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort()
}

function leaves(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(leaves)
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves)
  return [value]
}

function leafEntries(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafEntries(item, `${prefix}[${index}]`))
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      leafEntries(item, prefix ? `${prefix}.${key}` : key),
    )
  }
  return [[prefix, value]]
}

const SERVICE_NAMES = [
  "ChatGPT",
  "Claude Code",
  "Claude Desktop",
  "Gemini",
  "Copilot",
  "Perplexity",
  "Mistral",
  "Codex",
  "Cursor",
  "OpenCode",
  "T3 Code",
]

/** Named AI chats and agents in one string; "Claude" alone counts when not part of a product name. */
function serviceCount(text: string): number {
  const named = SERVICE_NAMES.filter((name) => text.includes(name)).length
  const bareClaude = /Claude(?! Code| Desktop)/.test(text) ? 1 : 0
  return named + bareClaude
}

/**
 * Joel 2026-11-26: the site listed every supported AI chat and agent in
 * several places. Marketing copy names two examples ("AI-chattar som ChatGPT
 * och Claude"); the full list lives only where the reader asked for it.
 */
const FULL_SERVICE_LISTS = new Set(["faq.groups[1].items[1].a", "guides.metaDescription"])

describe("localized copy", () => {
  it("keeps the English and Swedish copy trees in lockstep", () => {
    expect(leafPaths(en)).toEqual(leafPaths(sv))
  })

  it("preserves interpolation variables across translations", () => {
    const svLeaves = leaves(sv)
    const enLeaves = leaves(en)
    expect(enLeaves).toHaveLength(svLeaves.length)

    for (const [index, value] of svLeaves.entries()) {
      expect(placeholders(enLeaves[index])).toEqual(placeholders(value))
    }
  })

  it("never uses em dashes in visible copy", () => {
    for (const value of [...leaves(sv), ...leaves(en)]) {
      if (typeof value === "string") expect(value).not.toContain("\u2014")
    }
  })

  it("translates the interface without translating the simulated Swedish AI response", () => {
    expect(en.restoreDemo.stepTitle).not.toBe(sv.restoreDemo.stepTitle)
    expect(en.restoreDemo.joinWord).toBe(sv.restoreDemo.joinWord)
    expect(en.restoreDemo.generic).toEqual(sv.restoreDemo.generic)
    expect(en.restoreDemo.replies).toEqual(sv.restoreDemo.replies)
    expect(en.demo.languageNote).toContain("does not translate")
  })

  it.each([
    ["sv", sv],
    ["en", en],
  ] as const)(
    "names at most three AI services outside the full supported list (%s)",
    (_, strings) => {
      const long = leafEntries(strings)
        .filter(([path, value]) => typeof value === "string" && !FULL_SERVICE_LISTS.has(path))
        .filter(([, value]) => serviceCount(value as string) > 3)
        .map(([path]) => path)
      expect(long, 'say "AI-chattar som ChatGPT och Claude" instead of listing them all').toEqual(
        [],
      )
    },
  )

  it("keeps the structured-data description in index.html to examples", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf8")
    for (const [, description] of html.matchAll(/"description": "([^"]+)"/g)) {
      expect(serviceCount(description), description).toBeLessThanOrEqual(3)
    }
  })
})
