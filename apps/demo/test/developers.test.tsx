// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Developers } from "../src/components/Developers"
import copy from "../src/i18n/sv.json"

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

  it("switches the code examples that differ between TypeScript and JavaScript", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    expect(container.textContent).toContain("const recognizer: NerRecognizer")

    const javascriptButtons = screen.getAllByRole("button", { name: /JavaScript/ })
    expect(javascriptButtons).toHaveLength(2)
    fireEvent.click(javascriptButtons[0])

    expect(container.textContent).not.toContain("const recognizer: NerRecognizer")
    expect(
      javascriptButtons.every((button) => button.getAttribute("aria-pressed") === "true"),
    ).toBe(true)
  })

  it("marks the identical clinical example as shared instead of offering a false choice", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    const clinicalHeading = [...container.querySelectorAll("h2")].find(
      (heading) => heading.textContent === "Valfri profil för vårdtext",
    )
    const clinicalCode = clinicalHeading?.nextElementSibling?.nextElementSibling
    const clinicalDocs = clinicalHeading?.nextElementSibling?.querySelector<HTMLAnchorElement>("a")

    expect(clinicalCode?.textContent).toContain("JS / TS")
    expect(clinicalCode?.querySelectorAll(".code-tab")).toHaveLength(0)
    expect(clinicalDocs?.href).toBe(
      "https://github.com/joelhagvall/maskera/blob/main/packages/ner/README.md#clinical-profile",
    )
  })

  it("places the optional clinical profile after the standard restore flow", () => {
    const { container } = render(<Developers go={vi.fn()} onCoverage={vi.fn()} />)

    const headings = [...container.querySelectorAll("h2")]
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Installera",
      "Maskera en text",
      "Skicka till AI-tjänsten och återställ svaret",
      "Valfri profil för vårdtext",
    ])
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
})
