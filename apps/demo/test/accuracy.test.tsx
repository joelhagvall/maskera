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
const redactionComparisonSource = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-logosguard-2.4.4.json"), "utf8"),
)
const releaseContract = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../docs/benchmark-release.json"), "utf8"),
)

describe("Accuracy", () => {
  it("renders the current published results and their limitations", () => {
    render(<Accuracy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.accuracy.title })).toBeTruthy()
    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.currentTitle })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: copy.accuracy.redactionComparisonTitle }),
    ).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.comparisonTitle })).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: copy.accuracy.historicalComparisonTitle }),
    ).toBeTruthy()
    expect(screen.getAllByRole("table")).toHaveLength(5)
    for (const stat of copy.accuracy.currentStats) {
      expect(screen.getByText(stat.value)).toBeTruthy()
    }
    for (const comparisonCase of copy.accuracy.comparisonCases) {
      expect(screen.getAllByRole("heading", { name: comparisonCase.title }).length).toBeGreaterThan(
        0,
      )
      for (const row of comparisonCase.rows) {
        expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
        expect(
          screen
            .getAllByRole("link", {
              name: `${row.system} — ${copy.accuracy.externalLinkLabel}`,
            })
            .some((link) => link.getAttribute("href") === row.href),
        ).toBe(true)
        expect(screen.getAllByText(row.masked).length).toBeGreaterThan(0)
        expect(screen.getByText(row.typedF1)).toBeTruthy()
      }
    }
    for (const row of copy.accuracy.redactionComparisonRows) {
      expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
      expect(
        screen
          .getAllByRole("link", {
            name: `${row.system} — ${copy.accuracy.externalLinkLabel}`,
          })
          .some((link) => link.getAttribute("href") === row.href),
      ).toBe(true)
      expect(screen.getByText(row.fullHits)).toBeTruthy()
      expect(screen.getByText(row.partialLeaks)).toBeTruthy()
      expect(screen.getByText(row.misses)).toBeTruthy()
    }
    for (const comparisonCase of copy.accuracy.historicalComparisonCases) {
      expect(screen.getAllByRole("heading", { name: comparisonCase.title }).length).toBeGreaterThan(
        0,
      )
      for (const row of comparisonCase.rows) {
        expect(screen.getAllByText(row.system).length).toBeGreaterThan(0)
        if (row.href) {
          expect(
            screen
              .getAllByRole("link", {
                name: `${row.system} — ${copy.accuracy.externalLinkLabel}`,
              })
              .some((link) => link.getAttribute("href") === row.href),
          ).toBe(true)
        }
        if (row.links) {
          for (const modelLink of row.links) {
            expect(
              screen
                .getAllByRole("link", {
                  name: `${row.system}, ${modelLink.label} — ${copy.accuracy.externalLinkLabel}`,
                })
                .some((link) => link.getAttribute("href") === modelLink.href),
            ).toBe(true)
          }
        }
        if (row.description) {
          expect(screen.getAllByText(row.description).length).toBeGreaterThan(0)
        }
        if (row.size) expect(screen.getAllByText(row.size).length).toBeGreaterThan(0)
        expect(screen.getAllByText(row.masked).length).toBeGreaterThan(0)
        expect(screen.getAllByText(row.typedF1).length).toBeGreaterThan(0)
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
        .getByRole("link", { name: new RegExp(copy.accuracy.redactionComparisonCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/benchmark-logosguard-2.4.4.json")
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.redactionScriptsCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/bench/score-logosguard-domain.mjs")
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
    expect(document.body.textContent).toContain("v18")
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
    expect(redactionComparisonSource.measuredAt).toBe("2026-08-14")
    expect(redactionComparisonSource.corpus).toMatchObject({ texts: 258, annotations: 952 })
    expect(redactionComparisonSource.systems.maskera.totals).toMatchObject({
      hits: 933,
      partials: 8,
      misses: 11,
      fullHitRatePct: "98.0",
    })
    expect(redactionComparisonSource.systems.logosguard.totals).toMatchObject({
      hits: 606,
      partials: 49,
      misses: 297,
      fullHitRatePct: "63.7",
    })
    expect(releaseContract.schemaVersion).toBe(5)
    expect(releaseContract.historical.modelComparison).toMatchObject({
      status: "historical-v18-aggregate",
      matching: "overlap",
      labels: ["PER", "LOC", "ORG"],
      corpus: { documents: 22, entities: 58, rawRetained: false },
    })
    expect(releaseContract.historical.modelComparison.rows).toHaveLength(11)
    expect(copy.accuracy.historicalComparisonCases[0].rows).toHaveLength(11)
    expect(copy.accuracy.historicalComparisonCases[1].rows).toHaveLength(10)
    expect(
      copy.accuracy.historicalComparisonCases[0].rows.every((row) => row.description.length > 0),
    ).toBe(true)
    expect(copy.accuracy.comparisonBody).toContain("svensk NER-modell")
    expect(copy.accuracy.redactionComparisonBody).toContain("inte en fristående NER-modell")
  })
})
