// Single source of truth for per-route metadata. Both consumers read from
// here: applyViewMeta in routing.ts (SPA navigation) and vite.config.ts,
// which generates the static developers/integritet/tjanster HTML shells at
// config load. Editing a title or description here updates both; the shells
// are gitignored so they cannot drift. index.html stays hand-authored: its
// SEO title, og-description and JSON-LD @graph intentionally differ from the
// bare in-app "maskera" title.

export type View = "demo" | "transparency" | "dev" | "services"

export const SITE_ORIGIN = "https://maskera.dev"

export const viewPaths: Record<View, string> = {
  demo: "/",
  dev: "/developers",
  transparency: "/integritet",
  services: "/tjanster",
}

export function viewUrl(view: View): string {
  return new URL(viewPaths[view], SITE_ORIGIN).href
}

// The tab shows this at runtime; the favicon already carries the maskera mark.
// Safari hides the leading word of a tab title (favicon/close button cover it)
// and clips the tail when long, so a long title loses "maskera" either way.
// Home is the brand: keep it to the bare word so it never truncates and the
// name stays visible. Sub-pages lead with the page, brand last. The descriptive
// tagline lives on in the static <title> + og/twitter tags for SEO and sharing.
export const viewMeta: Record<View, { title: string; description: string }> = {
  demo: {
    title: "maskera",
    description:
      "maskera döljer svenska personuppgifter (namn, personnummer, adresser) innan de når ChatGPT eller andra AI-tjänster. Allt körs i webbläsaren.",
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
    title: "för företag · maskera",
    description:
      "Jämför Maskera open source och Maskera Gateway, som körs på CPU i er egen miljö före era AI-anrop.",
  },
}

export const routeHtmlViews = ["dev", "transparency", "services"] as const
export type RouteHtmlView = (typeof routeHtmlViews)[number]

const jsonLd: Record<RouteHtmlView, object> = {
  dev: {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "maskera",
    url: viewUrl("dev"),
    codeRepository: "https://github.com/joelhagvall/maskera",
    programmingLanguage: "TypeScript",
    runtimePlatform: ["Web browser", "Node.js"],
    license: "https://opensource.org/license/mit",
    inLanguage: "sv",
  },
  transparency: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Integritet & transparens · maskera",
    url: viewUrl("transparency"),
    description:
      "Så fungerar maskeras lokala personuppgiftsmaskering, modellträning, begränsningar och testdata.",
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: "maskera", url: `${SITE_ORIGIN}/` },
  },
  services: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Maskera för företag",
    url: viewUrl("services"),
    description:
      "Open source och privat CPU-baserad Gateway för svensk personuppgiftsmaskering före AI-anrop.",
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: "maskera", url: `${SITE_ORIGIN}/` },
  },
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Renders the static HTML shell for a sub-page route (see vite.config.ts). */
export function renderRouteHtml(view: RouteHtmlView): string {
  const title = escapeHtml(viewMeta[view].title)
  const description = escapeHtml(viewMeta[view].description)
  const url = viewUrl(view)
  // Escape "<" so a "</script>" in a future value can never close the tag.
  const structuredData = JSON.stringify(jsonLd[view], null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\n/g, "\n      ")
  // Only the developers page renders code blocks, so it alone preloads the
  // mono font.
  const monoPreload =
    view === "dev"
      ? `\n    <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />`
      : ""

  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <!-- Light is the default: only an explicit toggle choice switches to
         dark, the system preference is not consulted. One meta, not two
         media-driven ones, or a system-dark visitor would get dark browser
         chrome around a light page. -->
    <meta name="theme-color" content="#ffffff" />
    <!-- Sets the theme before first paint so there is no flash. -->
    <script>
      ;(function () {
        try {
          var d = localStorage.getItem("theme") === "dark"
          var e = document.documentElement
          e.dataset.theme = d ? "dark" : "light"
          e.style.colorScheme = d ? "dark" : "light"
          if (d) {
            document
              .querySelectorAll('meta[name="theme-color"]')
              .forEach(function (m) {
                m.setAttribute("content", "#0a0a0a")
              })
          }
        } catch (_) {}
      })()
    </script>

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="maskera" />
    <meta property="og:locale" content="sv_SE" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE_ORIGIN}/og.png" />

    <script type="application/ld+json">
      ${structuredData}
    </script>
    <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />${monoPreload}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}
