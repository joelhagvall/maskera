// @vitest-environment jsdom
import { regnummer } from "@maskera/core"
import { render, screen } from "@testing-library/react"
import { hybridDefaultDetectors } from "maskera"
import { describe, expect, it } from "vitest"
import { Coverage } from "../src/components/Coverage"
import copy from "../src/i18n/sv.json"

const modelLabels = ["NAMN", "PLATS", "ORGANISATION", "ADRESS"]

describe("Coverage", () => {
  it("renders every documented category", () => {
    render(<Coverage />)

    expect(screen.getByRole("heading", { name: copy.coverage.heading })).toBeTruthy()
    for (const group of copy.coverage.groups) {
      for (const item of group.items) {
        expect(screen.getByText(item.name)).toBeTruthy()
      }
    }
  })

  it("keeps the documented standard labels in sync with the hybrid runtime", () => {
    const documented = copy.coverage.groups
      .filter((group) => group.id === "model" || group.id === "rules")
      .flatMap((group) => group.items.map((item) => item.label))
    const runtime = [...modelLabels, ...hybridDefaultDetectors.map((detector) => detector.label)]

    expect([...new Set(documented)].sort()).toEqual([...new Set(runtime)].sort())
  })

  it("documents registration numbers as optional", () => {
    const optional = copy.coverage.groups.find((group) => group.id === "optional")
    expect(optional?.items.map((item) => item.label)).toContain(regnummer.label)
  })
})
