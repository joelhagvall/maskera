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
  vi.unstubAllGlobals()
  setUserAgent(CHROME_UA)
})

describe("ExtensionHeroActions", () => {
  it("points to the services install section while no store listing is live", () => {
    allSoon()
    setUserAgent(CHROME_UA)
    const goSection = vi.fn()
    render(<ExtensionHeroActions goSection={goSection} />)

    const install = screen.getByRole("link", { name: copy.extensionInstall.heroInstall })
    expect(install.getAttribute("href")).toBe("/tjanster#tillagg")
    expect(install.querySelector("svg")).toBeTruthy()
    fireEvent.click(install)
    expect(goSection).toHaveBeenLastCalledWith("services", "tillagg")

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })
    const agents = screen.getByRole("button", { name: copy.extensionInstall.heroAgents })
    expect(agents.querySelectorAll(".agent-logo-badge")).toHaveLength(4)
    fireEvent.click(agents)
    expect(writeText).toHaveBeenCalledWith(copy.agentSetup.promptText)
  })

  it("offers the visitor's store once that listing is live", () => {
    chromeLive()
    setUserAgent(CHROME_UA)
    render(<ExtensionHeroActions goSection={vi.fn()} />)

    const add = screen.getByRole("link", { name: "Lägg till i Chrome, gratis" })
    expect(add.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(add.getAttribute("target")).toBe("_blank")
    expect(add.querySelector("svg")).toBeTruthy()
  })

  it("sends phones to the in-page demo without a desktop browser icon", () => {
    chromeLive()
    setUserAgent(IPHONE_UA)
    render(<ExtensionHeroActions goSection={vi.fn()} />)

    const demo = screen.getByRole("link", { name: copy.extensionInstall.heroTryDemo })
    expect(demo.getAttribute("href")).toBe("#testa")
    expect(demo.querySelector("svg")).toBeNull()
  })
})

describe("ExtensionInstall", () => {
  it("shows Snart rows and promotes the ZIP download to a primary CTA while no store is live", () => {
    allSoon()
    render(<ExtensionInstall />)

    const list = screen.getByRole("list", { name: copy.extensionInstall.listLabel })
    expect(within(list).getAllByText(copy.extensionInstall.soon)).toHaveLength(4)
    expect(within(list).queryAllByRole("link")).toHaveLength(0)
    const zipLink = screen.getByRole("link", { name: copy.extensionInstall.zipCta })
    expect(zipLink.getAttribute("href")).toBe(
      "https://app.maskera.dev/downloads/maskera-extension-0.2.0.zip",
    )
    expect(zipLink.className).toContain("ext-zip-cta")
    expect(screen.queryByRole("link", { name: /Testa Pro/ })).toBeNull()
  })

  it("links live stores and demotes the ZIP download to an inline fallback", () => {
    chromeLive()
    render(<ExtensionInstall />)

    const list = screen.getByRole("list", { name: copy.extensionInstall.listLabel })
    const [chrome] = within(list).getAllByRole("link")
    expect(chrome.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(within(list).getAllByText(copy.extensionInstall.soon)).toHaveLength(3)
    const zipLink = screen.getByRole("link", { name: copy.extensionInstall.zipCta })
    expect(zipLink.className).not.toContain("ext-zip-cta")
  })
})
