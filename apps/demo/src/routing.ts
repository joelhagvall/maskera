import { type MouseEvent, useEffect, useRef, useState } from "react"
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
  // Crawlers that execute JS (Google, SEO tools) index whatever document.title
  // ends up as. On a fresh landing on the home view, keep index.html's
  // descriptive static title for them; the bare brand title in viewMeta only
  // takes over once the user actually navigates.
  const hasNavigated = useRef(false)

  useEffect(() => {
    const onPop = () => {
      hasNavigated.current = true
      setView(viewFromPath(window.location.pathname))
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    if (!hasNavigated.current && view === "demo") return
    applyViewMeta(view)
  }, [view])

  const navigate = (next: View) => {
    hasNavigated.current = true
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
