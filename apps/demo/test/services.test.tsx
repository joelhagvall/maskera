// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Services } from "../src/components/Services"
import copy from "../src/i18n/sv.json"
import { portalUrl } from "../src/portal"

afterEach(cleanup)

describe("Services", () => {
  it("renders browser extension, install steps, Free vs Pro table, and open source without Gateway references", () => {
    const { container } = render(<Services go={vi.fn()} onCoverage={vi.fn()} />)

    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByText(copy.services.lede)).toBeTruthy()
    expect(screen.getByText(copy.services.sublede)).toBeTruthy()
    expect(container.textContent?.toLowerCase()).not.toContain("gateway")

    const productHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .filter((heading) =>
        ["Webbläsartillägg", "Öppen källkod"].includes(heading.textContent ?? ""),
      )

    expect(productHeadings.map((heading) => heading.textContent)).toEqual([
      "Webbläsartillägg",
      "Öppen källkod",
    ])

    const trialLinks = screen.getAllByRole("link", { name: /Testa Pro gratis i 7 dagar/ })
    expect(trialLinks.length).toBe(2)
    for (const link of trialLinks) {
      expect(link.getAttribute("href")).toContain(
        "app.maskera.dev/login?buy=extension-pro&signup=true",
      )
    }

    expect(screen.getByRole("link", { name: /Installera gratis/ }).getAttribute("href")).toBe(
      "#installera",
    )
    expect(screen.getByRole("link", { name: /Ladda ner ZIP-filen/ }).getAttribute("href")).toBe(
      "https://app.maskera.dev/downloads/maskera-extension-0.2.0.zip",
    )
    expect(screen.getByRole("heading", { name: copy.extensionInstall.title })).toBeTruthy()
    expect(screen.getByRole("list", { name: copy.extensionInstall.listLabel })).toBeTruthy()
    expect(screen.getByRole("table", { name: copy.services.compare.title })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.termsCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/extension/terms")
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.privacyCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/extension/privacy")
    expect(container.querySelector(".implementation-help")).toBeNull()
  })
})

describe("portal helpers", () => {
  it("localizes portal paths and preserves query parameters", () => {
    expect(portalUrl("/login?buy=extension-pro&signup=true", "demo_test", "sv")).toBe(
      "https://app.maskera.dev/login?buy=extension-pro&signup=true&utm_source=maskera_dev&utm_medium=referral&utm_content=demo_test",
    )
    expect(portalUrl("/login?buy=extension-pro&signup=true", "demo_test", "en")).toBe(
      "https://app.maskera.dev/en/login?buy=extension-pro&signup=true&utm_source=maskera_dev&utm_medium=referral&utm_content=demo_test",
    )
    expect(portalUrl("/extension/terms", "demo_terms", "en")).toBe(
      "https://app.maskera.dev/en/extension/terms?utm_source=maskera_dev&utm_medium=referral&utm_content=demo_terms",
    )
  })
})
