// @vitest-environment jsdom
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Header } from "../src/components/Header"
import copy from "../src/i18n/sv.json"

describe("Header", () => {
  it("pairs the browser demo with the extension call to action", () => {
    const go = vi.fn()
    const { container } = render(<Header go={go} />)

    expect(screen.getByRole("heading", { name: copy.header.title })).toBeTruthy()
    expect(screen.getByText(copy.header.browserEmphasis).tagName).toBe("STRONG")
    expect(container.querySelector(".lede-marker")?.textContent).toBe("[NAMN_1]")
    expect(container.querySelector(".lede")?.textContent).not.toContain("{marker}")
    const learnMore = screen.getByRole("link", { name: copy.extensionInstall.heroLearnMore })
    expect(learnMore.getAttribute("href")).toBe("/tjanster")
    fireEvent.click(learnMore)
    expect(go).toHaveBeenCalledWith("services")
    expect(container.querySelector(".hero-install")).toBeTruthy()
  })

  it("renders the hero heading text exactly once", () => {
    const { container } = render(<Header go={vi.fn()} />)
    // Crawlers read the h1's text content; responsive variants of the same
    // sentence used to triple it.
    expect(container.querySelector("h1")?.textContent).toBe(copy.header.title)
    expect(copy.header.titleMobile.split("\n").join(" ")).toBe(copy.header.title)
  })

  it("shows real extension captures that ship with the site", () => {
    const { container } = render(<Header go={vi.fn()} />)
    for (const alt of [copy.header.productPreviewAlt, copy.header.productPopupAlt]) {
      const image = within(container).getByAltText(alt)
      const src = image.getAttribute("src") ?? ""
      const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public")
      expect(existsSync(join(publicDir, src)), src).toBe(true)
      expect(image.getAttribute("width")).toBeTruthy()
      expect(image.getAttribute("height")).toBeTruthy()
    }
  })
})
