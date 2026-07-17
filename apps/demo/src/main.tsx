import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { DeferredAnalytics } from "./components/DeferredAnalytics"
import "./styles.css"

// Cookieless, anonymous page-view counting, same-origin (/_vercel/insights).
// It never sees the text typed into the demo; the transparency page says so
// and must keep saying so if this ever changes.
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
    <DeferredAnalytics />
  </StrictMode>,
)
