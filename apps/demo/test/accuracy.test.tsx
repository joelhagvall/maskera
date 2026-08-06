// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Accuracy } from "../src/components/Accuracy"
import copy from "../src/i18n/sv.json"

const comparisonSource = readFileSync(resolve(process.cwd(), "../../bench/README.md"), "utf8")
const benchmarkSource = readFileSync(resolve(process.cwd(), "../../docs/BENCHMARKS.md"), "utf8")

const sourceNames: Record<string, string> = {
  Maskera: "maskera",
  "Microsoft Presidio (sv)": "presidio-sv",
  "EU PII Safeguard": "eu-pii-safeguard",
  "OpenAI Privacy Filter": "privacy-filter",
  "Blindfold (regler)": "blindfold-local",
}

function sourcePercent(value: string): string {
  const normalized = value.replace(",", ".").replace(" %", "%")
  return normalized === "100%" ? "100.0%" : normalized
}

function resultBlock(heading: string): string {
  const start = comparisonSource.indexOf(heading)
  const end = comparisonSource.indexOf("\n### ", start + heading.length)
  return comparisonSource.slice(start, end === -1 ? undefined : end)
}

describe("Accuracy", () => {
  it("renders both published comparison tables and their limitations", () => {
    render(<Accuracy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.accuracy.title })).toBeTruthy()
    expect(screen.getAllByRole("table")).toHaveLength(2)
    expect(screen.getByRole("heading", { name: copy.accuracy.limitsTitle })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.accuracy.benchmarksCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md")
  })

  it("keeps every non-Azure comparison row aligned with the committed bench output", () => {
    const sets = [
      {
        rows: copy.accuracy.independentRows,
        source: resultBlock("### gold-real, independent"),
      },
      {
        rows: copy.accuracy.addressRows,
        source: resultBlock("### adr, street addresses"),
      },
    ]

    for (const set of sets) {
      for (const row of set.rows) {
        const sourceName = sourceNames[row.system]
        if (!sourceName) continue
        const sourceRow = set.source
          .split("\n")
          .find((line) => line.startsWith("| " + sourceName + " |"))

        expect(sourceRow).toBeDefined()
        expect(sourceRow).toContain(sourcePercent(row.precision))
        expect(sourceRow).toContain(sourcePercent(row.recall))
        expect(sourceRow).toContain(row.leaks.split(" ")[0])
      }
    }
  })

  it("pins the Maskera provenance to the benchmark source of truth", () => {
    expect(benchmarkSource).toContain("Published:** 2026-08-06")
    expect(benchmarkSource).toContain("7ecd7a531c989d09ffb3d9ecf4168696786a204e")
    expect(benchmarkSource).toContain("Measured:** 2026-07-19")
    expect(benchmarkSource).toContain("maskera@0.6.4")
    expect(benchmarkSource).toContain("42,705,681 bytes")
    expect(benchmarkSource).toContain("| span F1    | 99.8%")
    expect(copy.accuracy.provenance[0]).toContain("2026-08-06")
    expect(copy.accuracy.provenance[0]).toContain("v19")
    expect(copy.accuracy.provenance[0]).toContain("43 MB")
    expect(copy.accuracy.provenance[1]).toContain("2026-07-19")
    expect(copy.accuracy.provenance[1]).toContain("0.6.4")
    expect(copy.accuracy.provenance[1]).toContain("v18")
    expect(copy.accuracy.limits[0]).toContain("99,8 procent")
    expect(copy.accuracy.limits[0]).toContain("noll fullständiga missar")
    expect(comparisonSource).toContain("measured 2026-07-22")
  })
})
