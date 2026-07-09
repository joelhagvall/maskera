import { lazy } from "react"

// The two content-only sub-pages are code-split so they don't ship in the main
// bundle until visited. Each import is wrapped once so the same module promise
// backs both the lazy() component and its preload() helper; calling preload
// before navigation warms the browser cache so the switch has no blank frame.
const importDevelopers = () => import("./components/Developers")
const importTransparency = () => import("./components/Transparency")

export const Developers = lazy(() => importDevelopers().then((m) => ({ default: m.Developers })))
export const Transparency = lazy(() =>
  importTransparency().then((m) => ({ default: m.Transparency })),
)

export const preloadDevelopers = importDevelopers
export const preloadTransparency = importTransparency

// Warm both sub-page chunks once the main thread goes idle after first paint,
// so the first navigation is instant even on touch (no hover/focus to trigger
// the per-link preload). Runs at most once; failures are ignored (the lazy()
// import will simply fetch on demand as a fallback).
export function prefetchPagesWhenIdle() {
  const warm = () => {
    importDevelopers().catch(() => {})
    importTransparency().catch(() => {})
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(warm, { timeout: 2000 })
  } else {
    setTimeout(warm, 1200)
  }
}
