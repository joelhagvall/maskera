import { type MouseEvent, useEffect, useState } from "react"
import { activeLocale, localeFromPath, setActiveLocale, useLocale } from "./i18n"
import { getViewMeta, getViewPaths, type View, viewPaths, viewUrl } from "./meta"

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
  return "demo"
}

export function useRoute() {
  const locale = useLocale()
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const onPop = () => {
      setActiveLocale(localeFromPath(window.location.pathname))
      setView(viewFromPath(window.location.pathname))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // The bare brand title replaces index.html's descriptive static title as
  // soon as the app mounts: the tab must read "maskera", also on a fresh
  // landing. JS-rendering crawlers see the swap too; the descriptive tagline
  // for SEO/sharing lives in the static og/twitter tags and page content.
  useEffect(() => {
    applyViewMeta(view, locale)
  }, [view, locale])

  const navigate = (next: View) => {
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
