import { PORTAL_ORIGIN } from "./portal"

export type BrowserId = "chrome" | "edge" | "firefox" | "safari"
export type VisitorBrowser = BrowserId | "mobile"

export type ExtensionBrowser = {
  id: BrowserId
  /** Public store listing, or null while the store has not published it. */
  storeUrl: string | null
}

/**
 * The one list of browsers the extension targets, in display order. Set a
 * storeUrl only once that store's listing is public: the hero button and the
 * install card switch from "Snart" to the store link on that value alone.
 */
export const EXTENSION_BROWSERS: readonly ExtensionBrowser[] = [
  {
    id: "chrome",
    storeUrl: "https://chromewebstore.google.com/detail/maskera/gjllhfldkkmbdhjhldjkglcihjdicbbe",
  },
  { id: "edge", storeUrl: null },
  { id: "firefox", storeUrl: null },
  { id: "safari", storeUrl: null },
]

/** Manual-install fallback (load unpacked) until the stores are live. */
export const EXTENSION_DOWNLOAD_URL = `${PORTAL_ORIGIN}/downloads/maskera-extension-0.2.2.zip`

/**
 * The hero's store button for one kind of visitor. public/theme-init.js reads
 * the user agent before first paint and sets `html[data-browser]` to one of
 * these kinds; the stylesheet then shows only the matching button, so the
 * prerendered page never flashes another browser's button. Phones and
 * tablets cannot run desktop extensions; unknown desktop browsers (Brave,
 * Arc, Opera, Vivaldi) are Chromium and take the Chrome build.
 */
export type HeroTarget = {
  visitor: VisitorBrowser
  /** Store listing to link, or null when the hero should link elsewhere. */
  storeUrl: string | null
  /** Set when the link is another browser's store, as Edge uses Chrome's. */
  via: BrowserId | null
}

export const VISITOR_KINDS: readonly VisitorBrowser[] = [
  "chrome",
  "edge",
  "firefox",
  "safari",
  "mobile",
]

/**
 * One hero target per visitor kind. Edge installs from the Chrome Web Store
 * after one "allow extensions from other stores" prompt, so it links there
 * until its own Edge Add-ons listing is live.
 */
export function heroTargets(browsers: readonly ExtensionBrowser[]): HeroTarget[] {
  const storeOf = (id: BrowserId) => browsers.find((browser) => browser.id === id)?.storeUrl ?? null
  return VISITOR_KINDS.map((visitor) => {
    if (visitor === "mobile") return { visitor, storeUrl: null, via: null }
    const own = storeOf(visitor)
    if (own) return { visitor, storeUrl: own, via: null }
    const chrome = visitor === "edge" ? storeOf("chrome") : null
    return chrome
      ? { visitor, storeUrl: chrome, via: "chrome" }
      : { visitor, storeUrl: null, via: null }
  })
}
