// Single source of truth for locale-aware paths and per-route metadata. The
// runtime router and Vite's generated static HTML shells both read this file,
// so direct landings and client navigation cannot drift.

import { activeLocale, copies } from "./i18n"

import { type Locale, markdownPathFor, pathsByLocale, SITE_ORIGIN, type View } from "./paths"

export { pathsByLocale, SITE_ORIGIN, type View }

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
    about: {
      title: strings.about.metaTitle,
      description: strings.about.metaDescription,
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
  "about",
] as const
export type RouteHtmlView = (typeof routeHtmlViews)[number]

/**
 * The operator, as the home page's publisher and the about page's main entity.
 * contactPoint and address let agents verify the business and answer contact
 * questions without rendering the site (index.html carries the same data in
 * its hand-authored @graph).
 */
export const ORGANIZATION_JSON_LD = {
  "@type": "Organization",
  "@id": `${SITE_ORIGIN}/#hagvall-labs`,
  name: "Hägvall Labs AB",
  legalName: "Hägvall Labs AB",
  url: "https://hagvall-labs.com",
  email: "hej@maskera.dev",
  identifier: {
    "@type": "PropertyValue",
    propertyID: "Swedish organisation number",
    value: "559598-0110",
  },
  founder: { "@type": "Person", name: "Joel Hägvall", url: "https://joelhagvall.com" },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Stockholm",
    addressCountry: "SE",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "hej@maskera.dev",
      url: `${SITE_ORIGIN}/en/about#kontakt`,
      availableLanguage: ["sv", "en"],
    },
    {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "hej@maskera.dev",
      url: `${SITE_ORIGIN}/en/services`,
      availableLanguage: ["sv", "en"],
    },
  ],
  sameAs: ["https://github.com/joelhagvall/maskera"],
} as const

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
      case "about":
        return strings.about.title
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
      },
      publisher: ORGANIZATION_JSON_LD,
      sameAs: [
        "https://github.com/joelhagvall/maskera",
        "https://www.npmjs.com/package/maskera",
        "https://huggingface.co/joelhagvall/maskera-sv-ner",
        "https://hagvall-labs.com",
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

  if (view === "about") {
    return {
      ...shared,
      "@type": ["AboutPage", "ContactPage"],
      mainEntity: ORGANIZATION_JSON_LD,
      isPartOf: {
        "@type": "WebSite",
        name: strings.meta.siteName,
        url: viewUrl("demo", locale),
      },
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
  // The demo and developer pages show mono text above the fold (the
  // hand-authored Swedish index.html preloads it too); the diagrams are only
  // on the developer page.
  const monoPreload =
    view === "demo" || view === "dev"
      ? `
    <link rel="preload" href="/fonts/geist-mono-latin.woff2" as="font" type="font/woff2" crossorigin />`
      : ""
  const devPreloads =
    view === "dev"
      ? `${monoPreload}
    <link rel="preload" href="${lightDiagram}" as="image" type="image/svg+xml" fetchpriority="high" />
    <link rel="preload" href="${darkDiagram}" as="image" type="image/svg+xml" fetchpriority="high" />`
      : monoPreload

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
    <link rel="alternate" type="text/markdown" href="${markdownPathFor(viewPath(view, locale))}" />
    <link rel="service-desc" type="application/vnd.oai.openapi+json" href="/openapi.json" />
    <meta name="theme-color" content="#ffffff" />
    <script src="/theme-init.js"></script>

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
