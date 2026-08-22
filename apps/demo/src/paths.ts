// Locale-aware route table with no imports, so the Vercel routing middleware
// (middleware.ts, bundled for the edge runtime) and the React app can share
// one list of pages without pulling React or the i18n JSON into the edge
// bundle. meta.ts re-exports what the app needs.

export type Locale = "sv" | "en"

export type View =
  | "demo"
  | "transparency"
  | "testdata"
  | "privacy"
  | "dev"
  | "services"
  | "accuracy"
  | "security"
  | "about"

export const SITE_ORIGIN = "https://maskera.dev"

export const pathsByLocale: Record<Locale, Record<View, string>> = {
  sv: {
    demo: "/",
    dev: "/utvecklare",
    transparency: "/integritet",
    testdata: "/testdata",
    privacy: "/integritetspolicy",
    services: "/tjanster",
    accuracy: "/traffsakerhet",
    security: "/sakerhet",
    about: "/om",
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
    about: "/en/about",
  },
}

/** Every HTML page the site serves, both locales, in sitemap order. */
export const PAGE_PATHS: readonly string[] = [
  ...Object.values(pathsByLocale.sv),
  ...Object.values(pathsByLocale.en),
]

/**
 * The Markdown sibling of a page: `/` -> `/index.md`, `/utvecklare` ->
 * `/utvecklare.md`, `/en` -> `/en.md`. scripts/prerender.mjs writes these
 * into dist/ and middleware.ts rewrites `Accept: text/markdown` requests to
 * them; the files are also fetchable directly.
 */
export function markdownPathFor(pagePath: string): string {
  return pagePath === "/" ? "/index.md" : `${pagePath}.md`
}

/**
 * Locale-less aliases that redirect (308, vercel.json) to a real page. Agents
 * and auditors probe these conventional paths; keeping them here lets the
 * middleware pass them through and a test keep vercel.json in sync.
 */
export const ALIAS_REDIRECTS: Readonly<Record<string, string>> = {
  "/developers": "/en/developers",
  "/about": "/en/about",
  "/contact": "/en/about#kontakt",
  "/privacy": "/en/privacy-policy",
  "/docs": "/en/developers",
}

/** Machine-readable files served from the site root (public/ or build output). */
export const WELL_KNOWN_FILES: readonly string[] = [
  "/llms.txt",
  "/sitemap.xml",
  "/robots.txt",
  "/benchmark-release.json",
  "/benchmark-release.schema.json",
  "/whitepaper.pdf",
]
