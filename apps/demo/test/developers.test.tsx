// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Developers } from "../src/components/Developers"
import en from "../src/i18n/en.json"
import copy from "../src/i18n/sv.json"

const sv = copy

afterEach(cleanup)

describe("Developers", () => {
  it("supports arrow, Home and End keys in the package-manager tabs", () => {
    render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    const npm = screen.getByRole("tab", { name: "npm" })
    const pnpm = screen.getByRole("tab", { name: "pnpm" })
    const yarn = screen.getByRole("tab", { name: "yarn" })

    npm.focus()
    fireEvent.keyDown(npm, { key: "ArrowRight" })
    expect(pnpm.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(pnpm)

    fireEvent.keyDown(pnpm, { key: "End" })
    expect(yarn.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(yarn)

    fireEvent.keyDown(yarn, { key: "Home" })
    expect(npm.getAttribute("aria-selected")).toBe("true")
    expect(document.activeElement).toBe(npm)
  })

  it("shows mask, send and restore as one shared JS / TS snippet", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    const install = container.querySelector("#installera")
    const snippet = install?.nextElementSibling?.nextElementSibling
    expect(snippet?.textContent).toContain("redactWithNer(")
    expect(snippet?.textContent).toContain("restore(svar)")
    expect(snippet?.textContent).toContain(copy.developerApi.sharedLanguageLabel)
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(0)
  })

  it("orders the page agents, own code, then how it works", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    const headings = [...container.querySelectorAll("h2")]
    expect(headings.map((heading) => heading.textContent)).toEqual([
      copy.developerApi.agentsTitle,
      copy.developerApi.installTitle,
      copy.developerApi.diagramTitle,
    ])
    expect(container.querySelector("#sa-fungerar-det + .layers-fig")).toBeTruthy()
  })

  // Joel found the page repeating the same client list and model size in
  // several places. Prose outside code blocks states each fact once.
  it.each([sv, en])("states each fact once in the prose ($developerApi.title)", (strings) => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)
    const prose = container.querySelector("article")?.cloneNode(true) as HTMLElement
    for (const code of prose.querySelectorAll("pre, code")) code.remove()
    const text = prose.textContent ?? ""
    const proseCopy = JSON.stringify([
      strings.developerApi,
      strings.agentSetup.modes.map((m) => m.summary),
    ])

    for (const fact of ["43 MB", "Claude Code", "Cursor", "Claude Desktop", "OpenCode"]) {
      expect(text.split(fact).length - 1, fact).toBeLessThanOrEqual(1)
      expect(proseCopy.split(fact).length - 1, fact).toBeLessThanOrEqual(1)
    }
  })

  it("explains the model lifecycle and supported runtimes after installation", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)
    const notes = container.querySelector(".developer-notes")

    expect(notes?.textContent).toContain(copy.developerApi.practicalTitle)
    for (const item of copy.developerApi.practicalItems) {
      expect(notes?.textContent).toContain(item)
    }
    expect(notes?.querySelector<HTMLAnchorElement>("a")?.href).toBe(
      "https://github.com/joelhagvall/maskera/blob/main/packages/ner/README.md",
    )
  })

  it("links every table-of-contents entry to a section on the page", () => {
    render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    for (const item of copy.developerApi.toc) {
      expect(document.querySelector(item.href), item.href).toBeTruthy()
    }
  })
})
