import { type MouseEvent, useEffect, useState } from "react"

export type View = "demo" | "transparency" | "dev"

export const viewPaths: Record<View, string> = {
  demo: "/",
  dev: "/developers",
  transparency: "/integritet",
}

const viewTitles: Record<View, string> = {
  demo: "maskera · maskera personuppgifter innan AI:n ser dem",
  dev: "maskera · för utvecklare",
  transparency: "maskera · integritet & transparens",
}

function viewFromPath(pathname: string): View {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === viewPaths.dev) return "dev"
  if (path === viewPaths.transparency) return "transparency"
  return "demo"
}

export function useRoute() {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const onPop = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    document.title = viewTitles[view]
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
