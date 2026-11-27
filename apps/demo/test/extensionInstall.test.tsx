// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { EXTENSION_DOWNLOAD_URL } from "../src/extensionBrowsers"
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

/** The prerendered hero button for one visitor kind (CSS shows only that one). */
function heroButton(container: HTMLElement, visitor: string): HTMLAnchorElement {
  const button = container.querySelector<HTMLAnchorElement>(
    `.hero-cta-primary[data-for="${visitor}"]`,
  )
  if (!button) throw new Error(`no hero button for ${visitor}`)
  return button
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
})

describe("ExtensionHeroActions", () => {
  it("prerenders one primary button per visitor kind, none tied to the user agent", () => {
    allSoon()
    const { container } = render(<ExtensionHeroActions goSection={vi.fn()} />)
    const kinds = [...container.querySelectorAll(".hero-cta-primary")].map((a) =>
      a.getAttribute("data-for"),
    )
    expect(kinds).toEqual(["chrome", "edge", "firefox", "safari", "mobile"])
  })

  it("points to the services install section while no store listing is live", () => {
    allSoon()
    const goSection = vi.fn()
    const { container } = render(<ExtensionHeroActions goSection={goSection} />)

    for (const visitor of ["chrome", "edge", "firefox", "safari"]) {
      const install = heroButton(container, visitor)
      expect(install.textContent).toBe(copy.extensionInstall.heroInstall)
      expect(install.getAttribute("href")).toBe("/tjanster#tillagg")
      expect(install.querySelector("svg")).toBeTruthy()
    }
    fireEvent.click(heroButton(container, "chrome"))
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

  it("offers the Chrome Web Store to Chrome, and to Edge until Edge Add-ons is live", () => {
    chromeLive()
    const { container } = render(<ExtensionHeroActions goSection={vi.fn()} />)

    const add = heroButton(container, "chrome")
    expect(add.textContent).toBe("Lägg till i Chrome, gratis")
    expect(add.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(add.getAttribute("target")).toBe("_blank")
    expect(add.querySelector("svg")).toBeTruthy()

    const edge = heroButton(container, "edge")
    expect(edge.textContent).toBe("Lägg till i Edge via Chrome Web Store")
    expect(edge.getAttribute("href")).toBe("https://chromewebstore.google.com/detail/example")
    expect(heroButton(container, "firefox").getAttribute("href")).toBe("/tjanster#tillagg")
  })

  it("sends phones to the in-page demo without a desktop browser icon", () => {
    chromeLive()
    const { container } = render(<ExtensionHeroActions goSection={vi.fn()} />)

    const demo = heroButton(container, "mobile")
    expect(demo.textContent).toBe(copy.extensionInstall.heroTryDemo)
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
    expect(zipLink.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL)
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
