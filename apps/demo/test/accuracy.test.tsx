// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Accuracy } from "../src/components/Accuracy"
import copy from "../src/i18n/sv.json"

const benchmarkSource = readFileSync(resolve(process.cwd(), "../../docs/BENCHMARKS.md"), "utf8")
const comparisonSource = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-kblab-v20.json"), "utf8"),
)
const bardsaiSource = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-bardsai-v20.json"), "utf8"),
)
const releaseContract = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-release.json"), "utf8"),
)

describe("Accuracy", () => {
  it("renders the plain-language results, Swedish comparison table, context examples and limits", () => {
    render(<Accuracy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.accuracy.title })).toBeTruthy()
    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.currentTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.comparisonTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.toolsComparison.title })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.contextTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.limitsTitle })).toBeTruthy()

    // One local PII tools table + one Swedish/EU model comparison table (no stale v18 table bloat)
    expect(screen.getAllByRole("table")).toHaveLength(2)
    for (const row of copy.accuracy.toolsComparison.rows) {
      expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
      expect(screen.getAllByText(row.domain).length).toBeGreaterThan(0)
    }

    for (const stat of copy.accuracy.currentStats) {
      expect(screen.getAllByText(stat.value).length).toBeGreaterThan(0)
    }
    for (const row of copy.accuracy.comparisonRows) {
      expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
      expect(screen.getAllByText(row.size).length).toBeGreaterThan(0)
      expect(screen.getAllByText(row.normal).length).toBeGreaterThan(0)
      expect(screen.getAllByText(row.lowercase).length).toBeGreaterThan(0)
    }
    for (const ex of copy.accuracy.contextExamples) {
      expect(screen.getByText(ex.input)).toBeTruthy()
    }
    for (const item of copy.accuracy.toc) {
      const href = screen.getByRole("link", { name: item.label }).getAttribute("href")
      expect(href).toBe(item.href)
      expect(document.querySelector(item.href)).toBeTruthy()
    }

    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.benchmarksCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md")

    expect(document.body.textContent).toContain("Bards AI EU PII v3")
    expect(document.body.textContent).toContain("OpenAI Privacy Filter")
    expect(document.body.textContent).toContain("Microsoft Presidio")
    expect(document.body.textContent).not.toContain("v18")
    expect(document.body.textContent).not.toContain("LogosGuard")
    expect(document.body.textContent).not.toContain("Azure")
    expect(document.body.textContent).not.toContain("LinkedIn")
  })

  it("pins the Maskera, KBLab and Bards AI results to the repo benchmark sources", () => {
    expect(benchmarkSource).toContain("Published:** 2026-11-25")
    expect(benchmarkSource).toContain("f417d65c08bcf814f639f8bf9221e30a79a53f39")
    expect(benchmarkSource).toContain("42,705,681 bytes")
    expect(copy.accuracy.provenance).toContain("2026-11-25")
    expect(copy.accuracy.provenance).toContain("2026-11-26")
    expect(copy.accuracy.provenance).toContain("43 MB")
    expect(copy.accuracy.currentStats.map((stat) => stat.value)).toEqual([
      "99,5 % · 0 missar",
      "100 % · 0 missar",
      "99,1 % (943 av 952)",
      "43 MB",
    ])
    expect(comparisonSource.measuredAt).toBe("2026-11-25")
    expect(comparisonSource.runs[0].results[0].redactionHits).toBe(211)
    expect(comparisonSource.runs[0].results[1].redactionHits).toBe(205)
    expect(comparisonSource.runs[1].results[0].redactionHits).toBe(211)
    expect(comparisonSource.runs[1].results[1].redactionHits).toBe(187)
    expect(bardsaiSource.measuredAt).toBe("2026-11-26")
    expect(bardsaiSource.runs[0].results[0].redactionHits).toBe(181)
    expect(bardsaiSource.runs[1].results[0].redactionHits).toBe(119)
    expect(releaseContract.schemaVersion).toBe(5)
    expect(copy.accuracy.toolsComparison.rows).toHaveLength(4)
  })
})
