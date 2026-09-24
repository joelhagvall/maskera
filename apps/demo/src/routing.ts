import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react"
import { activeLocale, copies, localeFromPath, setActiveLocale, useLocale } from "./i18n"
import {
  getViewMeta,
  getViewPaths,
  manifestPath,
  ogImageUrl,
  type View,
  viewPaths,
  viewUrl,
} from "./meta"

// Titles/descriptions live in meta.ts, shared with the generated static HTML
// shells for the sub-pages (see vite.config.ts).
export { type View, viewPaths }

function setMetaContent(selector: string, content: string) {
  const element = document.querySelector<HTMLMetaElement>(selector)
  if (element) element.content = content
}

export function applyViewMeta(view: View, locale = activeLocale) {
  const meta = getViewMeta(locale)[view]
  const url = viewUrl(view, locale)

  document.documentElement.lang = locale
  document.title = meta.title
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", url)
  document
    .querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="sv"]')
    ?.setAttribute("href", viewUrl(view, "sv"))
  document
    .querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="en"]')
    ?.setAttribute("href", viewUrl(view, "en"))
  document
    .querySelector<HTMLLinkElement>('link[rel="alternate"][hreflang="x-default"]')
    ?.setAttribute("href", viewUrl(view, "sv"))
  setMetaContent('meta[name="description"]', meta.description)
  setMetaContent('meta[property="og:url"]', url)
  setMetaContent('meta[property="og:title"]', meta.title)
  setMetaContent('meta[property="og:description"]', meta.description)
  setMetaContent('meta[name="twitter:title"]', meta.title)
  setMetaContent('meta[name="twitter:description"]', meta.description)
  setMetaContent('meta[property="og:locale"]', locale === "sv" ? "sv_SE" : "en_GB")
  setMetaContent('meta[property="og:locale:alternate"]', locale === "sv" ? "en_GB" : "sv_SE")
  setMetaContent('meta[property="og:image"]', ogImageUrl(locale))
  setMetaContent('meta[name="twitter:image"]', ogImageUrl(locale))
  setMetaContent('meta[property="og:image:alt"]', copies[locale].meta.ogImageAlt)
  setMetaContent('meta[name="twitter:image:alt"]', copies[locale].meta.ogImageAlt)
  document
    .querySelector<HTMLLinkElement>('link[rel="manifest"]')
    ?.setAttribute("href", manifestPath(locale))
}

export function viewFromPath(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/"
  const paths = getViewPaths(localeFromPath(path))
  if (path === paths.dev) return "dev"
  if (path === paths.transparency) return "transparency"
  if (path === paths.testdata) return "testdata"
  if (path === paths.privacy) return "privacy"
  if (path === paths.services) return "services"
  if (path === paths.accuracy) return "accuracy"
  if (path === paths.security) return "security"
  if (path === paths.about) return "about"
  return "demo"
}

export function useRoute(initialView?: View) {
  const locale = useLocale()
  // initialView lets the build-time prerender (entry-server.tsx) pick the
  // route without a window; the browser derives it from the URL.
  const [view, setView] = useState<View>(
    () => initialView ?? viewFromPath(window.location.pathname),
  )
  const currentViewRef = useRef(view)
  const homeScrollYRef = useRef(0)
  const skipScrollRestorationRef = useRef(false)

  useEffect(() => {
    const onPop = () => {
      if (currentViewRef.current === "demo") homeScrollYRef.current = window.scrollY
      skipScrollRestorationRef.current = false
      setActiveLocale(localeFromPath(window.location.pathname))
      setView(viewFromPath(window.location.pathname))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Browser history cannot restore the home position for the new history
  // entry created by the in-app "back to start" link, so route changes own
  // scroll restoration. Capture happens before setView replaces the long home
  // page; otherwise a shorter content page could clamp window.scrollY first.
  useLayoutEffect(() => {
    currentViewRef.current = view
    if (!skipScrollRestorationRef.current) {
      window.scrollTo(0, view === "demo" ? homeScrollYRef.current : 0)
    }
    skipScrollRestorationRef.current = false
  }, [view])

  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // The home title is the descriptive one from index.html, not the bare
  // brand: Google indexes the rendered title, so a swap to "maskera" on mount
  // would replace the tagline in search results.
  useEffect(() => {
    applyViewMeta(view, locale)
  }, [view, locale])

  const navigate = (next: View, options?: { skipScrollRestoration?: boolean }) => {
    const viewChanged = currentViewRef.current !== next
    if (viewChanged && currentViewRef.current === "demo") {
      homeScrollYRef.current = window.scrollY
    }
    skipScrollRestorationRef.current = viewChanged && options?.skipScrollRestoration === true
    if (viewFromPath(window.location.pathname) !== next) {
      window.history.pushState(null, "", getViewPaths(locale)[next])
    }
    setView(next)
  }

  return { view, navigate }
}

// Wraps an in-app navigation on a real <a href>: plain left-clicks route via
// pushState, while modifier clicks and middle clicks keep native behaviour
// (open in new tab, copy link, etc).
export function navClick(go: () => void) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    e.preventDefault()
    go()
  }
}
