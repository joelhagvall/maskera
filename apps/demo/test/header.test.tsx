// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Header } from "../src/components/Header"
import copy from "../src/i18n/sv.json"

describe("Header", () => {
  it("pairs the browser demo with the extension call to action", () => {
    const go = vi.fn()
    const { container } = render(<Header go={go} />)

    expect(screen.getByRole("heading", { name: copy.header.title })).toBeTruthy()
    expect(screen.getByText(copy.header.browserEmphasis).tagName).toBe("STRONG")
    expect(container.querySelector(".lede")?.textContent).toContain(copy.header.browserPrivacy)
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
})
