// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Accuracy } from "../src/components/Accuracy"
import { restoreMap } from "../src/heroScenes"
import en from "../src/i18n/en.json"
import copy from "../src/i18n/sv.json"
import { COVERAGE_CELLS, formatPct, SYSTEMS, summary } from "../src/independentBench"

afterEach(cleanup)

describe("Accuracy", () => {
  it("shows every Maskera cell and every system straight from the independent result", () => {
    render(<Accuracy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.accuracy.title })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.comparisonTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.accuracy.testsTitle })).toBeTruthy()
    expect(screen.getAllByRole("table")).toHaveLength(1)

    const text = document.body.textContent ?? ""
    for (const cell of COVERAGE_CELLS) {
      const value = summary.maskera[cell]
      expect(value, cell).toBeTruthy()
      if (value) expect(text).toContain(formatPct(value.maskedPct))
    }
    for (const system of SYSTEMS) {
      expect(screen.getAllByText(copy.accuracy.systems[system].name).length).toBeGreaterThan(0)
    }
    for (const item of copy.accuracy.toc) {
      expect(document.querySelector(item.href), item.href).toBeTruthy()
    }
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.benchmarksCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md")
  })

  it("shows no result from text Maskera's developer wrote", () => {
    render(<Accuracy go={vi.fn()} />)
    const text = document.body.textContent ?? ""
    // The author-written suites (258 texts / 952 values, 205 curated values,
    // 121 texts / 211 entities) stay in docs/BENCHMARKS.md as release gates.
    for (const ownNumber of [
      "952",
      "943",
      "258 texter",
      "211 av 211",
      "205 uppgifter",
      "KBLab",
      "Bards AI",
    ]) {
      expect(text).not.toContain(ownNumber)
    }
  })

  it("states only comparisons the result supports", () => {
    const pct = (system: (typeof SYSTEMS)[number], cell: (typeof COVERAGE_CELLS)[number]) =>
      summary[system]?.[cell]?.maskedPct ?? -1
    // "Maskera döljer flest namn (även i gemener) och flest adresser."
    for (const cell of ["names", "namesLowercase", "addresses"] as const) {
      for (const system of SYSTEMS.filter((s) => s !== "maskera")) {
        expect(pct("maskera", cell), `${cell} vs ${system}`).toBeGreaterThan(pct(system, cell))
      }
    }
    // "Presidio ligger marginellt högre på platser och träffar färre meningar utan personuppgifter."
    expect(pct("presidio", "places")).toBeGreaterThan(pct("maskera", "places"))
    const over = (system: (typeof SYSTEMS)[number]) => summary[system]?.overMasking?.pct ?? 100
    expect(over("presidio")).toBeLessThan(over("maskera"))
  })

  it("derives the over-masking limit note from the measured result instead of hardcoding it", () => {
    render(<Accuracy go={vi.fn()} />)
    const limits = document.querySelector("#begransningar")?.textContent ?? ""
    expect(limits).not.toContain("{overMasking}")
    expect(limits).toContain(formatPct(summary.maskera.overMasking?.pct ?? -1))
  })
  it("shows each context example as the model's real output, same in both languages", () => {
    const sv = copy.accuracy.contextExamples
    expect(en.accuracy.contextExamples.map(({ input, masked }) => ({ input, masked }))).toEqual(
      sv.map(({ input, masked }) => ({ input, masked })),
    )
    for (const ex of sv) {
      // restoreMap throws when the masked text does not line up with the input
      expect(Object.keys(restoreMap(ex.input, ex.masked)).length, ex.input).toBeGreaterThan(0)
    }
    render(<Accuracy go={vi.fn()} />)
    const tokens = [...document.querySelectorAll(".context-masked .token")].map(
      (n) => n.textContent,
    )
    expect(tokens).toEqual(sv.flatMap((ex) => ex.masked.match(/\[[A-ZÅÄÖ_]+_\d+\]/g) ?? []))
  })
})
