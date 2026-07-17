import { type MouseEvent, useEffect, useRef, useState } from "react"

export type View = "demo" | "transparency" | "dev" | "services"

export const viewPaths: Record<View, string> = {
  demo: "/",
  dev: "/developers",
  transparency: "/integritet",
  services: "/tjanster",
}

// The tab shows this at runtime; the favicon already carries the maskera mark.
// Safari hides the leading word of a tab title (favicon/close button cover it)
// and clips the tail when long, so a long title loses "maskera" either way.
// Home is the brand: keep it to the bare word so it never truncates and the
// name stays visible. Sub-pages lead with the page, brand last. The descriptive
// tagline lives on in the static <title> + og/twitter tags for SEO and sharing.
const viewMeta: Record<View, { title: string; description: string }> = {
  demo: {
    title: "maskera",
    description:
      "maskera hittar och döljer svenska personuppgifter innan texten når ChatGPT eller andra AI-tjänster. Allt körs i webbläsaren.",
  },
  dev: {
    title: "för utvecklare · maskera",
    description:
      "Installera maskera för svensk PII-maskering lokalt i webbläsaren eller Node. Öppen källkod, TypeScript och en egentränad svensk AI-modell.",
  },
  transparency: {
    title: "integritet & transparens · maskera",
    description:
      "Så fungerar maskeras lokala personuppgiftsmaskering, hur modellen tränats, vilka begränsningar som finns och vilken testdata demon använder.",
  },
  services: {
    title: "tjänster · maskera",
    description:
      "Få hjälp att granska och integrera lokal personuppgiftsmaskering i era AI-flöden, med fasta tjänstepaket och direkt stöd från maskeras skapare.",
  },
}

function setMetaContent(selector: string, content: string) {
  const element = document.querySelector<HTMLMetaElement>(selector)
  if (element) element.content = content
}

export function applyViewMeta(view: View) {
  const meta = viewMeta[view]
  const url = new URL(viewPaths[view], "https://maskera.dev").href

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
