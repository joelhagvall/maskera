// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
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

  it("ends every page with cards for the other docs pages", () => {
    const go = vi.fn()
    render(<DocsMcp go={go} />)
    const next = screen.getByRole("navigation", { name: copy.docs.nextLabel })
    const links = within(next).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/docs",
      "/docs/klienter",
      "/docs/sdk",
      "/docs/felsokning",
    ])
    expect(links[0].textContent).toContain(copy.docs.overview.lede)
    fireEvent.click(links[2])
    expect(go).toHaveBeenCalledWith("docsSdk")
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

  it("shows the agent prompt copy button on /docs and /docs/klienter", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    for (const Component of [DocsOverview, DocsClients] as const) {
      render(<Component go={vi.fn()} onCoverage={vi.fn()} />)
      const button = screen.getByRole("button", { name: copy.agentSetup.copyPromptCta })
      fireEvent.click(button)
      expect(writeText).toHaveBeenLastCalledWith(copy.agentSetup.promptText)
      cleanup()
    }
  })

  it("links every printed URL and site path across the docs pages", () => {
    const go = vi.fn()
    const { container } = render(<DocsOverview go={go} onCoverage={vi.fn()} />)

    const servicesLink = screen.getByRole("link", { name: "maskera.dev/tjanster" })
    expect(servicesLink.getAttribute("href")).toBe("/tjanster")
    fireEvent.click(servicesLink)
    expect(go).toHaveBeenCalledWith("services")

    for (const path of ["/docs.md", "/docs/mcp.md", "/setup-prompt.md", "/llms.txt"]) {
      expect(container.querySelector(`section a[href="${path}"]`), path).toBeTruthy()
    }
    cleanup()

    const goTroubleshooting = vi.fn()
    render(<DocsTroubleshooting go={goTroubleshooting} />)
    const accuracyLink = screen.getByRole("link", { name: "/traffsakerhet" })
    expect(accuracyLink.getAttribute("href")).toBe("/traffsakerhet")
    fireEvent.click(accuracyLink)
    expect(goTroubleshooting).toHaveBeenCalledWith("accuracy")
    cleanup()

    render(<DocsClients go={vi.fn()} />)
    expect(
      screen.getByRole("link", { name: "http://127.0.0.1:8787/_maskera" }).getAttribute("href"),
    ).toBe("http://127.0.0.1:8787/_maskera")
    // Fictional example email stays plain text, never a mailto link.
    expect(screen.queryByRole("link", { name: /@example\.com/ })).toBeNull()
  })
})
