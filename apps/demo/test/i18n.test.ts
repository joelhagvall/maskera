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

  it("translates the interface without translating the simulated Swedish AI response", () => {
    expect(en.restoreDemo.title).not.toBe(sv.restoreDemo.title)
    expect(en.restoreDemo.joinWord).toBe(sv.restoreDemo.joinWord)
    expect(en.restoreDemo.generic).toEqual(sv.restoreDemo.generic)
    expect(en.restoreDemo.replies).toEqual(sv.restoreDemo.replies)
    expect(en.demo.languageNote).toContain("does not translate")
  })
})
