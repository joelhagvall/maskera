// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import copy from "../src/i18n/sv.json"

const browsers = vi.hoisted(() => ({
  list: [] as { id: "chrome" | "edge" | "firefox" | "safari"; storeUrl: string | null }[],
}))

vi.mock("../src/extensionBrowsers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/extensionBrowsers")>()
  return {
    ...actual,
    get EXTENSION_BROWSERS() {
      return browsers.list
    },
  }
})

const { ExtensionHeroActions, ExtensionInstall } = await import(
  "../src/components/ExtensionInstall"
)

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36"
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1"

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true })
}

function allSoon() {
  browsers.list = [
    { id: "chrome", storeUrl: null },
    { id: "edge", storeUrl: null },
    { id: "firefox", storeUrl: null },
    { id: "safari", storeUrl: null },
  ]
}

function chromeLive() {
  allSoon()
  browsers.list[0] = { id: "chrome", storeUrl: "https://chromewebstore.google.com/detail/example" }
}

afterEach(() => {
  cleanup()
  setUserAgent(CHROME_UA)
})

describe("ExtensionHeroActions", () => {
  it("points to the install section while no store listing is live", () => {
    allSoon()
    setUserAgent(CHROME_UA)
    const go = vi.fn()
    render(<ExtensionHeroActions go={go} />)

    const install = screen.getByRole("link", { name: copy.extensionInstall.heroInstall })
    expect(install.getAttribute("href")).toBe("#installera")
    expect(screen.getByText(copy.extensionInstall.builtFor)).toBeTruthy()
    expect(screen.getAllByRole("img").map((icon) => icon.getAttribute("aria-label"))).toEqual([
      "Chrome",
      "Edge",
      "Firefox",
      "Safari",
    ])

    const learnMore = screen.getByRole("link", { name: copy.extensionInstall.heroLearnMore })
    expect(learnMore.getAttribute("href")).toBe("/tjanster")
    fireEvent.click(learnMore)
    expect(go).toHaveBeenCalledWith("services")
  })

  it("offers the visitor's store once that listing is live", () => {
    chromeLive()
    setUserAgent(CHROME_UA)
    render(<ExtensionHeroActions go={vi.fn()} />)

    const add = screen.getByRole("link", { name: "Lägg till i Chrome, gratis" })
    expect(add.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(add.getAttribute("target")).toBe("_blank")
    expect(screen.getByText(copy.extensionInstall.alsoFor)).toBeTruthy()
    expect(screen.getAllByRole("img").map((icon) => icon.getAttribute("aria-label"))).toEqual([
      "Edge",
      "Firefox",
      "Safari",
    ])
  })

  it("sends phones to the in-page demo", () => {
    chromeLive()
    setUserAgent(IPHONE_UA)
    render(<ExtensionHeroActions go={vi.fn()} />)

    expect(
      screen.getByRole("link", { name: copy.extensionInstall.heroTryDemo }).getAttribute("href"),
    ).toBe("#main-content")
  })
})

describe("ExtensionInstall", () => {
  it("shows Snart rows without links and keeps the ZIP fallback", () => {
    allSoon()
    render(<ExtensionInstall />)

    expect(screen.getByRole("heading", { name: copy.extensionInstall.title })).toBeTruthy()
    const list = screen.getByRole("list", { name: copy.extensionInstall.listLabel })
    expect(within(list).getAllByText(copy.extensionInstall.soon)).toHaveLength(4)
    expect(within(list).queryAllByRole("link")).toHaveLength(0)
    expect(
      screen.getByRole("link", { name: copy.extensionInstall.zipCta }).getAttribute("href"),
    ).toBe("https://app.maskera.dev/downloads/maskera-extension-0.1.4.zip")
    expect(screen.queryByRole("link", { name: /Testa Pro/ })).toBeNull()
  })

  it("links live stores and adds the trial link when asked", () => {
    chromeLive()
    render(<ExtensionInstall trialContent="demo_extension_trial" />)

    const list = screen.getByRole("list", { name: copy.extensionInstall.listLabel })
    const [chrome] = within(list).getAllByRole("link")
    expect(chrome.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(within(list).getAllByText(copy.extensionInstall.soon)).toHaveLength(3)
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.extensionInstall.trialCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/login?buy=extension-pro&signup=true")
  })
})
