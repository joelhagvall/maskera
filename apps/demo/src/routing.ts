import { type MouseEvent, useEffect, useState } from "react"
import { type View, viewMeta, viewPaths, viewUrl } from "./meta"

// Titles/descriptions live in meta.ts, shared with the generated static HTML
// shells for the sub-pages (see vite.config.ts).
export { type View, viewPaths }

function setMetaContent(selector: string, content: string) {
  const element = document.querySelector<HTMLMetaElement>(selector)
  if (element) element.content = content
}

export function applyViewMeta(view: View) {
  const meta = viewMeta[view]
  const url = viewUrl(view)

  document.title = meta.title
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute("href", url)
  setMetaContent('meta[name="description"]', meta.description)
  setMetaContent('meta[property="og:url"]', url)
  setMetaContent('meta[property="og:title"]', meta.title)
  setMetaContent('meta[property="og:description"]', meta.description)
  setMetaContent('meta[name="twitter:title"]', meta.title)
  setMetaContent('meta[name="twitter:description"]', meta.description)
}

function viewFromPath(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === viewPaths.dev) return "dev"
  if (path === viewPaths.transparency) return "transparency"
  if (path === viewPaths.services) return "services"
  return "demo"
}

export function useRoute() {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const onPop = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // The bare brand title replaces index.html's descriptive static title as
  // soon as the app mounts: the tab must read "maskera", also on a fresh
  // landing. JS-rendering crawlers see the swap too; the descriptive tagline
  // for SEO/sharing lives in the static og/twitter tags and page content.
  useEffect(() => {
    applyViewMeta(view)
  }, [view])

  const navigate = (next: View) => {
    if (viewFromPath(window.location.pathname) !== next) {
      window.history.pushState(null, "", viewPaths[next])
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
