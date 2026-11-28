// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DocsSdk } from "../src/components/Docs"
import { InstallTabs } from "../src/components/InstallTabs"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("InstallTabs", () => {
  it("supports arrow, Home and End keys in the package-manager tabs", () => {
    render(<InstallTabs />)

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
})

describe("DocsSdk", () => {
  it("shows install, then mask, send and restore, under the package choice", () => {
    const { container } = render(<DocsSdk go={vi.fn()} />)
    const section = container.querySelector('section[aria-labelledby="paket"]')
    expect(section?.querySelector('[role="tablist"]')).toBeTruthy()
    const snippet = section?.textContent ?? ""
    expect(snippet).toContain("redactWithNer(")
    expect(snippet).toContain("restore(svar)")
    expect(snippet).toContain(copy.developerApi.sharedLanguageLabel)
  })
})
