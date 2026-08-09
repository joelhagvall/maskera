// Single source of truth for per-route metadata. Both consumers read from
// here: applyViewMeta in routing.ts (SPA navigation) and vite.config.ts,
// which generates the static HTML shell for every content route at config
// load. Editing a title or description here updates both; the shells are
// gitignored so they cannot drift. index.html stays hand-authored: its SEO
// title, og-description and JSON-LD @graph intentionally differ from the bare
// in-app "maskera" title.

import copy from "./i18n/sv.json"

export type View =
  | "demo"
  | "transparency"
  | "testdata"
  | "privacy"
  | "dev"
  | "services"
  | "accuracy"
  | "security"

export const SITE_ORIGIN = "https://maskera.dev"

export const viewPaths: Record<View, string> = {
  demo: "/",
  dev: "/utvecklare",
  transparency: "/integritet",
  testdata: "/testdata",
  privacy: "/integritetspolicy",
  services: "/tjanster",
  accuracy: "/traffsakerhet",
  security: "/sakerhet",
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
    title: copy.meta.demoTitle,
    description: copy.meta.demoDescription,
  },
  dev: {
    title: copy.meta.devTitle,
    description: copy.meta.devDescription,
  },
  transparency: {
    title: copy.transparency.metaTitle,
    description: copy.transparency.metaDescription,
  },
  testdata: {
    title: copy.testData.metaTitle,
    description: copy.testData.metaDescription,
  },
  privacy: {
    title: copy.privacy.metaTitle,
    description: copy.privacy.metaDescription,
  },
  services: {
    title: copy.meta.servicesTitle,
    description: copy.meta.servicesDescription,
  },
  accuracy: {
    title: copy.accuracy.metaTitle,
    description: copy.accuracy.metaDescription,
  },
  security: {
    title: copy.security.metaTitle,
    description: copy.security.metaDescription,
  },
}

export const routeHtmlViews = [
  "dev",
  "transparency",
  "testdata",
  "privacy",
  "services",
  "accuracy",
  "security",
] as const
export type RouteHtmlView = (typeof routeHtmlViews)[number]

const jsonLd: Record<RouteHtmlView, object> = {
  dev: {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: copy.meta.siteName,
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
    name: copy.transparency.title,
    url: viewUrl("transparency"),
    description: copy.transparency.metaDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: `${SITE_ORIGIN}/` },
  },
  testdata: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.testData.title,
    url: viewUrl("testdata"),
    description: copy.testData.metaDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: viewUrl("demo") },
  },
  privacy: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.privacy.title,
    url: viewUrl("privacy"),
    description: copy.privacy.metaDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: viewUrl("demo") },
  },
  services: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.meta.servicesSchemaName,
    url: viewUrl("services"),
    description: copy.meta.servicesDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: `${SITE_ORIGIN}/` },
  },
  accuracy: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.accuracy.title,
    url: viewUrl("accuracy"),
    description: copy.accuracy.metaDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: viewUrl("demo") },
  },
  security: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: copy.security.title,
    url: viewUrl("security"),
    description: copy.security.metaDescription,
    inLanguage: "sv",
    isPartOf: { "@type": "WebSite", name: copy.meta.siteName, url: viewUrl("demo") },
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
  // Only the developers page renders code blocks and the architecture image,
  // so it alone preloads those resources. Both image themes are tiny and the
  // saved theme is applied by the inline script below before React mounts.
  const devPreloads =
    view === "dev"
      ? `
    <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/layers-sv.svg" as="image" type="image/svg+xml" fetchpriority="high" />
    <link rel="preload" href="/layers-sv-dark.svg" as="image" type="image/svg+xml" fetchpriority="high" />`
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
    <link rel="preload" href="/fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin />${devPreloads}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
}
