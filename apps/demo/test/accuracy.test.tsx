// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Accuracy } from "../src/components/Accuracy"
import copy from "../src/i18n/sv.json"

const benchmarkSource = readFileSync(resolve(process.cwd(), "../../docs/BENCHMARKS.md"), "utf8")
const comparisonSource = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-kblab-v19.json"), "utf8"),
)

describe("Accuracy", () => {
  it("renders the current published results and their limitations", () => {
    render(<Accuracy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.accuracy.title })).toBeTruthy()
    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.currentTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.comparisonTitle })).toBeTruthy()
    expect(screen.getAllByRole("table")).toHaveLength(2)
    for (const stat of copy.accuracy.currentStats) {
      expect(screen.getByText(stat.value)).toBeTruthy()
    }
    for (const comparisonCase of copy.accuracy.comparisonCases) {
      expect(screen.getByRole("heading", { name: comparisonCase.title })).toBeTruthy()
      for (const row of comparisonCase.rows) {
        expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
        expect(screen.getAllByText(row.masked).length).toBeGreaterThan(0)
        expect(screen.getByText(row.typedF1)).toBeTruthy()
      }
    }
    expect(screen.getByRole("heading", { name: copy.accuracy.limitsTitle })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.benchmarksCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md")
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.comparisonCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/benchmark-kblab-v19.json")
    expect(
      screen.getByRole("link", { name: new RegExp(copy.accuracy.scriptsCta) }).getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/training/benchmark_competitors.py")

    for (const item of copy.accuracy.toc) {
      const href = screen.getByRole("link", { name: item.label }).getAttribute("href")
      expect(href).toBe(item.href)
      expect(document.querySelector(item.href)).toBeTruthy()
    }
    expect(document.body.textContent).not.toContain("v18")
    expect(document.body.textContent).not.toContain("Azure")
    expect(document.body.textContent).not.toContain("LinkedIn")
  })

  it("pins the Maskera provenance to the benchmark source of truth", () => {
    expect(benchmarkSource).toContain("Published:** 2026-08-06")
    expect(benchmarkSource).toContain("b1aa7e799fa4839f8668dda691e893706e971523")
    expect(benchmarkSource).toContain("42,705,681 bytes")
    expect(copy.accuracy.provenance[0]).toContain("2026-08-06")
    expect(copy.accuracy.provenance[0]).toContain("v19")
    expect(copy.accuracy.provenance[0]).toContain("43 MB")
    expect(copy.accuracy.currentStats.map((stat) => stat.value)).toEqual([
      "96,9 % / 1 av 205",
      "100,0 % / 0 av 57",
    ])
    expect(copy.accuracy.currentStats.map((stat) => stat.label)).toEqual([
      "blandade svenska testtexter: F1 / missar",
      "syntetiska adresser: F1 / missar",
    ])
    expect(copy.accuracy.currentTitle).toBe("Aktuella testresultat")
    expect(copy.accuracy.provenance).toHaveLength(1)
    expect(copy.accuracy.limits[0]).toContain("Testmängderna")
    expect(comparisonSource.measuredAt).toBe("2026-08-11")
    expect(comparisonSource.artifacts["joelhagvall/maskera-sv-ner"].sha256).toBe(
      "6f4bf061e9af6827e4ffe82bcfcb84709daa84c5f5ed7a05c2083a3e535fda66",
    )
    expect(
      comparisonSource.artifacts["KBLab/bert-base-swedish-lowermix-reallysimple-ner"].sha256,
    ).toBe("49545200dd3a32ac76e14da91aa2c0b0ba6d4e5d5efbf90d922f7f91f6b7de89")
    expect(comparisonSource.runs[0].results[0].redactionHits).toBe(211)
    expect(comparisonSource.runs[0].results[1].redactionHits).toBe(205)
    expect(comparisonSource.runs[1].results[0].redactionHits).toBe(211)
    expect(comparisonSource.runs[1].results[1].redactionHits).toBe(187)
  })
})
