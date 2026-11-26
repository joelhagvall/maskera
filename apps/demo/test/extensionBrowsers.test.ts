import { describe, expect, it } from "vitest"
import {
  detectBrowser,
  EXTENSION_BROWSERS,
  EXTENSION_DOWNLOAD_URL,
  featuredBrowser,
} from "../src/extensionBrowsers"

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

describe("featuredBrowser", () => {
  const live = [
    { id: "chrome", storeUrl: "https://chromewebstore.google.com/detail/example" },
    { id: "edge", storeUrl: null },
  ] as const

  it("features the visitor's browser only once its store listing is live", () => {
    expect(featuredBrowser("chrome", live)?.id).toBe("chrome")
    expect(featuredBrowser("edge", live)).toBeUndefined()
    expect(featuredBrowser("mobile", live)).toBeUndefined()
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
      "https://app.maskera.dev/downloads/maskera-extension-0.2.0.zip",
    )
  })
})
