// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Footer } from "../src/components/Footer"
import { GITHUB } from "../src/constants"
import copy from "../src/i18n/sv.json"

describe("Footer", () => {
  it("links the open-source label to the repository", () => {
    render(
      <Footer
        onTransparency={vi.fn()}
        onTestData={vi.fn()}
        onPolicy={vi.fn()}
        onAccuracy={vi.fn()}
        onSecurity={vi.fn()}
        onAbout={vi.fn()}
      />,
    )

    const link = screen.getByRole("link", { name: copy.footer.openSource })
    expect(link.getAttribute("href")).toBe(GITHUB)
    expect(link.getAttribute("target")).toBe("_blank")
  })

  it("links the about and contact page", () => {
    const onAbout = vi.fn()
    const { container } = render(
      <Footer
        onTransparency={vi.fn()}
        onTestData={vi.fn()}
        onPolicy={vi.fn()}
        onAccuracy={vi.fn()}
        onSecurity={vi.fn()}
        onAbout={onAbout}
      />,
    )

    const link = within(container).getByRole("link", { name: copy.navigation.about })
    expect(link.getAttribute("href")).toBe("/om")
  })
})
