import { renderToString } from "react-dom/server"
import { App } from "./App"
import { About } from "./components/About"
import { Accuracy } from "./components/Accuracy"
import { DemoWorkspace } from "./components/DemoWorkspace"
import { Developers } from "./components/Developers"
import { DocsClients, DocsMcp, DocsOverview, DocsSdk, DocsTroubleshooting } from "./components/Docs"
import { Faq } from "./components/Faq"
import { Guides } from "./components/Guides"
import { Industries } from "./components/Industries"
import { PrivacyPolicy } from "./components/PrivacyPolicy"
import { Security } from "./components/Security"
import { Services } from "./components/Services"
import { TestData } from "./components/TestData"
import { Transparency } from "./components/Transparency"
import { localeFromPath, setActiveLocale } from "./i18n"
import { getViewMeta, viewUrl } from "./meta"
import { markdownPathFor } from "./paths"
import { viewFromPath } from "./routing"
import { registerViews } from "./views"

// The SSR bundle runs only at build time (prerender.mjs) and in tests, never
// in the browser, so registering all views up front keeps renderRoute()
// synchronous while the browser bundle stays code-split per view.
registerViews({
  demo: DemoWorkspace,
  dev: Developers,
  docs: DocsOverview,
  docsMcp: DocsMcp,
  docsClients: DocsClients,
  docsSdk: DocsSdk,
  docsTroubleshooting: DocsTroubleshooting,
  transparency: Transparency,
  testdata: TestData,
  privacy: PrivacyPolicy,
  services: Services,
  accuracy: Accuracy,
  security: Security,
  about: About,
  faq: Faq,
  guides: Guides,
  industries: Industries,
})

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
