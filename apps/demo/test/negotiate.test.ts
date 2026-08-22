import { describe, expect, it } from "vitest"
import { parseAccept, selectMediaType } from "../src/negotiate"

const PAGE = ["text/html", "text/markdown"] as const
const NOT_FOUND = ["text/markdown", "application/json", "text/html"] as const

describe("parseAccept", () => {
  it("treats a missing or empty header as */*", () => {
    expect(parseAccept(null)).toEqual([{ type: "*", subtype: "*", q: 1, params: 0, position: 0 }])
    expect(parseAccept("   ")).toEqual([{ type: "*", subtype: "*", q: 1, params: 0, position: 0 }])
  })

  it("reads q-values, clamps them and counts other parameters", () => {
    expect(parseAccept("text/markdown;q=0.9, text/html;q=2, text/plain;q=abc, */*;q=0")).toEqual([
      { type: "text", subtype: "markdown", q: 0.9, params: 0, position: 0 },
      { type: "text", subtype: "html", q: 1, params: 0, position: 1 },
      { type: "text", subtype: "plain", q: 1, params: 0, position: 2 },
      { type: "*", subtype: "*", q: 0, params: 0, position: 3 },
    ])
    expect(parseAccept("text/html;level=1;q=0.5")[0]).toMatchObject({ q: 0.5, params: 1 })
  })
})

describe("selectMediaType for a page offering html and markdown", () => {
  const cases: [string | null, string | null][] = [
    [null, "text/html"],
    ["*/*", "text/html"],
    ["text/*", "text/html"],
    ["text/html", "text/html"],
    ["text/markdown", "text/markdown"],
    // Browser header: html explicit, everything else via */*
    [
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "text/html",
    ],
    // Client order breaks ties between equal q
    ["text/html, text/markdown", "text/html"],
    ["text/markdown, text/html", "text/markdown"],
    // q beats position
    ["text/html;q=0.8, text/markdown;q=0.9", "text/markdown"],
    ["text/markdown;q=0.5, text/html", "text/html"],
    // A specific q=0 overrides a wildcard regardless of order
    ["*/*, text/html;q=0", "text/markdown"],
    ["text/html;q=0, */*", "text/markdown"],
    // Agent asking for markdown but tolerating anything
    ["text/markdown, */*;q=0.1", "text/markdown"],
    // Neither representation acceptable -> 406
    ["application/json", null],
    ["text/markdown;q=0", null],
    ["text/html;q=0, text/markdown;q=0, */*;q=0", null],
  ]
  for (const [header, expected] of cases) {
    it(`${JSON.stringify(header)} -> ${expected}`, () => {
      expect(selectMediaType(header, PAGE)).toBe(expected)
    })
  }
})

describe("selectMediaType for the negotiated 404", () => {
  it("defaults agents (no Accept or */*) to markdown, browsers to html, API clients to json", () => {
    expect(selectMediaType(null, NOT_FOUND)).toBe("text/markdown")
    expect(selectMediaType("*/*", NOT_FOUND)).toBe("text/markdown")
    expect(selectMediaType("text/html,*/*;q=0.8", NOT_FOUND)).toBe("text/html")
    expect(selectMediaType("application/json", NOT_FOUND)).toBe("application/json")
    expect(selectMediaType("application/json, text/plain;q=0.9", NOT_FOUND)).toBe(
      "application/json",
    )
    expect(selectMediaType("image/png", NOT_FOUND)).toBeNull()
  })
})
