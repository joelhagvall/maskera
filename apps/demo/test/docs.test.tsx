// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import contract from "../../../docs/product-contract.json"
import {
  DocsClients,
  DocsMcp,
  DocsOverview,
  DocsSdk,
  DocsTroubleshooting,
  keepFlagsWhole,
} from "../src/components/Docs"
import { DOCTOR_COMMAND } from "../src/doctorSample"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("Docs pages", () => {
  const pages = [
    ["overview", DocsOverview, copy.docs.overview],
    ["mcp", DocsMcp, copy.docs.mcp],
    ["clients", DocsClients, copy.docs.clients],
    ["sdk", DocsSdk, copy.docs.sdk],
    ["troubleshooting", DocsTroubleshooting, copy.docs.troubleshooting],
  ] as const

  for (const [name, Component, data] of pages) {
    it(`renders ${name} with TOC anchors, verification box, subnav, and zero Gateway mentions`, () => {
      const go = vi.fn()
      const { container } = render(<Component go={go} onCoverage={vi.fn()} />)

      expect(screen.getByRole("heading", { level: 1, name: data.title })).toBeTruthy()
      expect(container.querySelector(".docs-verify")?.textContent).toContain(data.verifyTitle)

      for (const section of data.sections) {
        expect(container.querySelector(`#${section.id}`), section.id).toBeTruthy()
      }

      // Links to /setup-prompt.md and /llms.txt exist in the footer nav
      expect(container.querySelector('a[href="/setup-prompt.md"]')).toBeTruthy()
      expect(container.querySelector('a[href="/llms.txt"]')).toBeTruthy()
      expect(container.textContent?.toLowerCase()).not.toContain("gateway")
    })
  }

  it("navigates between docs pages via the subnav", () => {
    const go = vi.fn()
    render(<DocsOverview go={go} onCoverage={vi.fn()} />)

    const mcpLink = screen.getByRole("link", { name: copy.docs.nav.mcp })
    expect(mcpLink.getAttribute("href")).toBe("/docs/mcp")
    fireEvent.click(mcpLink)
    expect(go).toHaveBeenCalledWith("docsMcp")
  })

  it("shows the architecture diagram and a real doctor run on the overview", () => {
    const onCoverage = vi.fn()
    const { container } = render(<DocsOverview go={vi.fn()} onCoverage={onCoverage} />)

    const section = container.querySelector("section:has(#valj-lage)")
    expect(section?.querySelector("figure.layers-fig img")?.getAttribute("alt")).toBe(
      copy.developerApi.diagramAlt,
    )
    const verify = container.querySelector(".docs-verify")
    expect(verify?.textContent).toContain(DOCTOR_COMMAND)
    expect(verify?.textContent).toContain(`maskera-mcp doctor (OK, v${contract.packages.mcp}`)
    expect(verify?.textContent).toContain("(0 leaks, restored=ok)")
    // the printed output is shown, not copied
    expect(verify?.querySelector(".code-output")?.textContent?.split("\n")).toHaveLength(7)
  })

  it("keeps CLI flags and query parameters on one line", () => {
    const { container } = render(
      <p>{keepFlagsWhole("Kör med --no-raw-restore / ?no_raw_restore=1.")}</p>,
    )
    const whole = [...container.querySelectorAll(".no-break")].map((el) => el.textContent)
    expect(whole).toEqual(["--no-raw-restore", "?no_raw_restore=1"])
    expect(container.textContent).toBe("Kör med --no-raw-restore / ?no_raw_restore=1.")
  })

  it("labels every table cell with its column name for the stacked phone layout", () => {
    for (const [name, Component, data] of pages) {
      const { container } = render(<Component go={vi.fn()} />)
      const tables = data.sections.flatMap((s) => ("table" in s && s.table ? [s.table] : []))
      const rendered = container.querySelectorAll(".data-table")
      expect(rendered.length, name).toBe(tables.length)
      rendered.forEach((table, i) => {
        for (const row of table.querySelectorAll("tbody tr")) {
          const labels = [...row.querySelectorAll("td")].map((td) => td.getAttribute("data-label"))
          expect(labels, name).toEqual(tables[i].headers)
        }
      })
      cleanup()
    }
  })

  it("lets keyboard users reach every code block, since long lines scroll sideways", () => {
    // axe scrollable-region-focusable failed the CI a11y audit on /docs/mcp.
    for (const [name, Component] of pages) {
      const { container } = render(<Component go={vi.fn()} />)
      for (const pre of container.querySelectorAll("pre")) {
        expect(pre.getAttribute("tabindex"), name).toBe("0")
      }
      cleanup()
    }
  })
})
