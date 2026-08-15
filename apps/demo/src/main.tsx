import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { App } from "./App"
import { DeferredAnalytics } from "./components/DeferredAnalytics"
import "./styles.css"

// Cookieless, anonymous page-view counting, same-origin (/_vercel/insights).
// It never sees the text typed into the demo; the transparency page says so
// and must keep saying so if this ever changes.
const container = document.getElementById("root") as HTMLElement
const tree = (
  <StrictMode>
    <App />
    <DeferredAnalytics />
  </StrictMode>
)

// The deployed pages are prerendered at build time (scripts/prerender.mjs),
// so the root already contains markup to hydrate. The dev server serves an
// empty root and mounts fresh instead.
if (container.hasChildNodes()) {
  hydrateRoot(container, tree)
} else {
  createRoot(container).render(tree)
}
