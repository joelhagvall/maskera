import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { EXTENSION_BROWSERS, EXTENSION_DOWNLOAD_URL, heroTargets } from "../src/extensionBrowsers"

const themeInit = readFileSync(new URL("../public/theme-init.js", import.meta.url), "utf8")

/** Runs the real public/theme-init.js for one user agent; returns html[data-browser]. */
function detectBrowser(userAgent: string): string | undefined {
  const documentElement = { dataset: {} as Record<string, string>, style: {} }
  runInNewContext(themeInit, {
    localStorage: { getItem: () => null },
    navigator: { userAgent },
    document: { documentElement, querySelectorAll: () => [] },
  })
  return documentElement.dataset.browser
}

const UA = {
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36 Edg/142.0.3595.53",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:154.0) Gecko/20100101 Firefox/154.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Mobile Safari/537.36",
  chromium:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/142.0.7444.59 Safari/537.36",
}

describe("detectBrowser", () => {
  it("maps desktop user agents to the extension build they can install", () => {
    expect(detectBrowser(UA.chrome)).toBe("chrome")
    expect(detectBrowser(UA.edge)).toBe("edge")
    expect(detectBrowser(UA.firefox)).toBe("firefox")
    expect(detectBrowser(UA.safari)).toBe("safari")
    expect(detectBrowser(UA.chromium)).toBe("chrome")
  })

  it("treats phones as mobile and unknown agents as Chromium", () => {
    expect(detectBrowser(UA.iphone)).toBe("mobile")
    expect(detectBrowser(UA.android)).toBe("mobile")
    expect(detectBrowser("")).toBe("chrome")
  })
})

describe("heroTargets", () => {
  const chromeLive = [
    { id: "chrome", storeUrl: "https://chromewebstore.google.com/detail/example" },
    { id: "edge", storeUrl: null },
    { id: "firefox", storeUrl: null },
    { id: "safari", storeUrl: null },
  ] as const
  const target = (browsers: Parameters<typeof heroTargets>[0], visitor: string) =>
    heroTargets(browsers).find((t) => t.visitor === visitor)

  it("has one target per kind theme-init.js can set", () => {
    expect(heroTargets(chromeLive).map((t) => t.visitor)).toEqual([
      "chrome",
      "edge",
      "firefox",
      "safari",
      "mobile",
    ])
  })

  it("links each browser to its own live store", () => {
    expect(target(chromeLive, "chrome")).toMatchObject({
      storeUrl: chromeLive[0].storeUrl,
      via: null,
    })
  })

  it("sends Edge to the Chrome Web Store until Edge Add-ons is live", () => {
    expect(target(chromeLive, "edge")).toMatchObject({
      storeUrl: chromeLive[0].storeUrl,
      via: "chrome",
    })
    const edgeLive = chromeLive.map((b) =>
      b.id === "edge"
        ? { ...b, storeUrl: "https://microsoftedge.microsoft.com/addons/detail/x" }
        : b,
    )
    expect(target(edgeLive, "edge")).toMatchObject({ via: null })
  })

  it("leaves Firefox, Safari and phones without a store link until theirs is live", () => {
    expect(target(chromeLive, "firefox")?.storeUrl).toBeNull()
    expect(target(chromeLive, "safari")?.storeUrl).toBeNull()
    expect(target(chromeLive, "mobile")?.storeUrl).toBeNull()
  })
})

describe("EXTENSION_BROWSERS", () => {
  it("lists the four targets in display order with the ZIP as fallback", () => {
    expect(EXTENSION_BROWSERS.map((browser) => browser.id)).toEqual([
      "chrome",
      "edge",
      "firefox",
      "safari",
    ])
    expect(EXTENSION_DOWNLOAD_URL).toBe(
      "https://app.maskera.dev/downloads/maskera-extension-0.2.2.zip",
    )
  })
})
