import { StrictMode } from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { App } from "./App"
import { DeferredAnalytics } from "./components/DeferredAnalytics"
import { viewFromPath } from "./routing"
import { loadView } from "./views"
import "./styles.css"

// Load only the active page chunk before hydrating the prerendered markup so
// hydration matches synchronously without pulling in every other route.
void loadView(viewFromPath(window.location.pathname)).then(() => {
  const container = document.getElementById("root") as HTMLElement
  const tree = (
    <StrictMode>
      <App />
      <DeferredAnalytics />
    </StrictMode>
  )

  if (container.hasChildNodes()) {
    hydrateRoot(container, tree)
  } else {
    createRoot(container).render(tree)
  }
})
