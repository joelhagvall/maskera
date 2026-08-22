import { renderToString } from "react-dom/server"
import { App } from "./App"
import { localeFromPath, setActiveLocale } from "./i18n"
import { getViewMeta, viewUrl } from "./meta"
import { markdownPathFor } from "./paths"
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

/**
 * What the Markdown rendering of a route needs besides the markup: its view,
 * canonical URL, language, the other locale's URL and the meta description.
 * Used by scripts/prerender.mjs for the text/markdown representation that
 * middleware.ts serves on Accept negotiation.
 */
export function routeInfo(pathname: string) {
  const locale = localeFromPath(pathname)
  const view = viewFromPath(pathname)
  const alternateLocale = locale === "sv" ? "en" : "sv"
  const url = viewUrl(view, locale)
  return {
    view,
    url,
    lang: locale,
    alternateLang: alternateLocale,
    alternateUrl: viewUrl(view, alternateLocale),
    markdownUrl: new URL(markdownPathFor(new URL(url).pathname), url).href,
    description: getViewMeta(locale)[view].description,
  }
}
