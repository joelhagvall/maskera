import { renderToString } from "react-dom/server"
import { App } from "./App"
import { localeFromPath, setActiveLocale } from "./i18n"
import { viewFromPath } from "./routing"

// Build-time prerender entry, driven by scripts/prerender.mjs after
// `vite build --ssr`. Renders one route's App tree to an HTML string that is
// injected into that route's dist shell, so every page paints its content
// from the served HTML instead of waiting for the JS bundle. main.tsx
// hydrates the markup on load.
export function renderRoute(pathname: string): string {
  // The copy proxy and viewPaths read the module-level active locale during
  // render, so it must track the route being rendered.
  setActiveLocale(localeFromPath(pathname))
  return renderToString(<App initialView={viewFromPath(pathname)} />)
}
