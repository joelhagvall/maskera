import { useSyncExternalStore } from "react"
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
  { id: "chrome", storeUrl: null },
  { id: "edge", storeUrl: null },
  { id: "firefox", storeUrl: null },
  { id: "safari", storeUrl: null },
]

/** Manual-install fallback (load unpacked) until the stores are live. */
export const EXTENSION_DOWNLOAD_URL = `${PORTAL_ORIGIN}/downloads/maskera-extension-0.1.4.zip`

/**
 * Maps a user agent to the extension build the visitor can install. Phones
 * and tablets cannot run desktop extensions; unknown desktop browsers
 * (Brave, Arc, Opera, Vivaldi) are Chromium and take the Chrome build.
 */
export function detectBrowser(userAgent: string): VisitorBrowser {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return "mobile"
  if (/Edg\//.test(userAgent)) return "edge"
  if (/Firefox\//.test(userAgent)) return "firefox"
  if (/Safari\//.test(userAgent) && !/Chrome\/|Chromium\//.test(userAgent)) return "safari"
  return "chrome"
}

const noSubscription = () => () => {}

/**
 * The visitor's browser for rendering. The prerender and the hydration pass
 * use "chrome" so the static HTML matches; React then re-renders once with
 * the real user agent.
 */
export function useVisitorBrowser(): VisitorBrowser {
  return useSyncExternalStore(
    noSubscription,
    () => detectBrowser(navigator.userAgent),
    () => "chrome",
  )
}

/** The browser whose store button the hero shows, if its listing is live. */
export function featuredBrowser(
  visitor: VisitorBrowser,
  browsers: readonly ExtensionBrowser[],
): ExtensionBrowser | undefined {
  if (visitor === "mobile") return undefined
  return browsers.find((browser) => browser.id === visitor && browser.storeUrl)
}
