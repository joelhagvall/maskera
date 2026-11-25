// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ExtensionPromo } from "../src/components/ExtensionPromo"
import { Services } from "../src/components/Services"
import copy from "../src/i18n/sv.json"
import { portalUrl } from "../src/portal"

afterEach(cleanup)

describe("Services", () => {
  it("renders browser extension and open source without Gateway references", () => {
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
    const extensionTrial = screen.getByRole("link", { name: /Testa Pro gratis i 14 dagar/ })
    expect(extensionTrial.getAttribute("href")).toContain(
      "app.maskera.dev/login?buy=extension-pro&signup=true",
    )
    const extensionInfo = screen.getByRole("link", { name: /Läs om tillägget/ })
    expect(extensionInfo.getAttribute("href")).toContain("app.maskera.dev/extension")
    expect(container.querySelector(".implementation-help")).toBeNull()
  })
})

describe("ExtensionPromo", () => {
  it("links directly from the browser demo into the extension self-service funnel", () => {
    render(<ExtensionPromo />)

    expect(screen.getByRole("heading", { name: copy.extensionPromo.title })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.extensionPromo.primaryCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/login?buy=extension-pro&signup=true")
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.extensionPromo.secondaryCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/extension")
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
    expect(portalUrl("/extension", "demo_info", "en")).toBe(
      "https://app.maskera.dev/en/extension?utm_source=maskera_dev&utm_medium=referral&utm_content=demo_info",
    )
  })
})
