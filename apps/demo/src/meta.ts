// Single source of truth for locale-aware paths and per-route metadata. The
// runtime router and Vite's generated static HTML shells both read this file,
// so direct landings and client navigation cannot drift.

import { activeLocale, copies, type Locale } from "./i18n"

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

const pathsByLocale: Record<Locale, Record<View, string>> = {
  sv: {
    demo: "/",
    dev: "/utvecklare",
    transparency: "/integritet",
    testdata: "/testdata",
    privacy: "/integritetspolicy",
    services: "/tjanster",
    accuracy: "/traffsakerhet",
    security: "/sakerhet",
  },
  en: {
    demo: "/en",
    dev: "/en/developers",
    transparency: "/en/privacy",
    testdata: "/en/test-data",
    privacy: "/en/privacy-policy",
    services: "/en/services",
    accuracy: "/en/accuracy",
    security: "/en/security",
  },
}

export function viewPath(view: View, locale: Locale = activeLocale): string {
  return pathsByLocale[locale][view]
}

export function getViewPaths(locale: Locale): Record<View, string> {
  return pathsByLocale[locale]
}

// Existing components read this record during render. The proxy follows the
// active locale after an in-page language switch while keeping ordinary
// property access and real hrefs throughout the component tree.
export const viewPaths = new Proxy(pathsByLocale.sv, {
  get(_target, property: keyof Record<View, string>) {
    return pathsByLocale[activeLocale][property]
  },
})

export function viewUrl(view: View, locale: Locale = activeLocale): string {
  return new URL(viewPath(view, locale), SITE_ORIGIN).href
}

export type ViewMeta = { title: string; description: string }

export function getViewMeta(locale: Locale): Record<View, ViewMeta> {
  const strings = copies[locale]
  return {
    demo: {
      title: strings.meta.demoTitle,
      description: strings.meta.demoDescription,
    },
    dev: {
      title: strings.meta.devTitle,
      description: strings.meta.devDescription,
    },
    transparency: {
      title: strings.transparency.metaTitle,
      description: strings.transparency.metaDescription,
    },
    testdata: {
      title: strings.testData.metaTitle,
      description: strings.testData.metaDescription,
    },
    privacy: {
      title: strings.privacy.metaTitle,
      description: strings.privacy.metaDescription,
    },
    services: {
      title: strings.meta.servicesTitle,
      description: strings.meta.servicesDescription,
    },
    accuracy: {
      title: strings.accuracy.metaTitle,
      description: strings.accuracy.metaDescription,
    },
    security: {
      title: strings.security.metaTitle,
      description: strings.security.metaDescription,
    },
  }
}

export const viewMeta = new Proxy(getViewMeta("sv"), {
  get(_target, property: View) {
    return getViewMeta(activeLocale)[property]
  },
})

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

function jsonLdFor(view: View, locale: Locale): object {
  const strings = copies[locale]
  const url = viewUrl(view, locale)
  const schemaName = (() => {
    switch (view) {
      case "transparency":
        return strings.transparency.title
      case "testdata":
        return strings.testData.title
      case "privacy":
        return strings.privacy.title
      case "services":
        return strings.meta.servicesSchemaName
      case "accuracy":
        return strings.accuracy.title
      case "security":
        return strings.security.title
      default:
        return strings.meta.siteName
    }
  })()
  const shared = {
    "@context": "https://schema.org",
    name: schemaName,
    url,
    description: getViewMeta(locale)[view].description,
    inLanguage: locale,
  }

  if (view === "demo") {
    return {
      ...shared,
      "@type": "WebApplication",
      applicationCategory: "SecurityApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires JavaScript",
      offers: { "@type": "Offer", price: "0", priceCurrency: "SEK" },
      author: {
        "@type": "Person",
        name: "Joel Hägvall",
        url: "https://joelhagvall.com",
      },
      sameAs: [
        "https://github.com/joelhagvall/maskera",
        "https://www.npmjs.com/package/maskera",
        "https://huggingface.co/joelhagvall/maskera-sv-ner",
      ],
    }
  }

  if (view === "dev") {
    return {
      ...shared,
      "@type": "SoftwareSourceCode",
      codeRepository: "https://github.com/joelhagvall/maskera",
      programmingLanguage: "TypeScript",
      runtimePlatform: ["Web browser", "Node.js"],
      license: "https://opensource.org/license/mit",
    }
  }

  return {
    ...shared,
    "@type": "WebPage",
    isPartOf: {
      "@type": "WebSite",
      name: strings.meta.siteName,
      url: viewUrl("demo", locale),
    },
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Renders a localized static HTML shell (see vite.config.ts). */
export function renderRouteHtml(view: View, locale: Locale = activeLocale): string {
  const strings = copies[locale]
  const meta = getViewMeta(locale)[view]
  // The generated English home gets a descriptive static title. React swaps
  // it to the short brand title once the app mounts, matching the Swedish root.
  const staticTitle = view === "demo" ? strings.header.title : meta.title
  const title = escapeHtml(staticTitle)
  const description = escapeHtml(meta.description)
  const url = viewUrl(view, locale)
  const alternateSv = viewUrl(view, "sv")
  const alternateEn = viewUrl(view, "en")
  const structuredData = JSON.stringify(jsonLdFor(view, locale), null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\n/g, "\n      ")
  const lightDiagram = locale === "sv" ? "/layers-sv.svg" : "/layers.svg"
  const darkDiagram = locale === "sv" ? "/layers-sv-dark.svg" : "/layers-dark.svg"
  const devPreloads =
    view === "dev"
      ? `
    <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="${lightDiagram}" as="image" type="image/svg+xml" fetchpriority="high" />
    <link rel="preload" href="${darkDiagram}" as="image" type="image/svg+xml" fetchpriority="high" />`
      : ""

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="sv" href="${alternateSv}" />
    <link rel="alternate" hreflang="en" href="${alternateEn}" />
    <link rel="alternate" hreflang="x-default" href="${alternateSv}" />
    <meta name="theme-color" content="#ffffff" />
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
              .forEach(function (m) { m.setAttribute("content", "#0a0a0a") })
          }
        } catch (_) {}
      })()
    </script>

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="maskera" />
    <meta property="og:locale" content="${locale === "sv" ? "sv_SE" : "en_GB"}" />
    <meta property="og:locale:alternate" content="${locale === "sv" ? "en_GB" : "sv_SE"}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${SITE_ORIGIN}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
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
