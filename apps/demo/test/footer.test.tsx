// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Footer } from "../src/components/Footer"
import { GITHUB } from "../src/constants"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("Footer", () => {
  it("links the open-source label to the repository", () => {
    const go = vi.fn()
    render(<Footer go={go} />)

    const link = screen.getByRole("link", { name: copy.footer.openSource })
    expect(link.getAttribute("href")).toBe(GITHUB)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(screen.getByRole("link", { name: copy.footer.portal }).getAttribute("href")).toContain(
      "https://app.maskera.dev/login",
    )
    expect(screen.getByRole("link", { name: copy.navigation.services }).getAttribute("href")).toBe(
      "/tjanster",
    )
    expect(screen.getByRole("link", { name: copy.navigation.docs }).getAttribute("href")).toBe(
      "/docs",
    )
  })

  it("links the about and contact page", () => {
    const go = vi.fn()
    const { container } = render(<Footer go={go} />)

    const link = within(container).getByRole("link", { name: copy.navigation.about })
    expect(link.getAttribute("href")).toBe("/om")
    fireEvent.click(link)
    expect(go).toHaveBeenCalledWith("about")
  })

  it("links the FAQ and industries pages", () => {
    render(<Footer go={vi.fn()} />)
    expect(screen.getByRole("link", { name: copy.navigation.faq }).getAttribute("href")).toBe(
      "/fragor",
    )
    expect(
      screen.getByRole("link", { name: copy.navigation.industries }).getAttribute("href"),
    ).toBe("/branscher")
  })
})
