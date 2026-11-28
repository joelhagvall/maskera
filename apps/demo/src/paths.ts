// Locale-aware route table with no imports, so the Vercel routing middleware
// (middleware.ts, bundled for the edge runtime) and the React app can share
// one list of pages without pulling React or the i18n JSON into the edge
// bundle. meta.ts re-exports what the app needs.

export type Locale = "sv" | "en"

export type View =
  | "demo"
  | "docs"
  | "docsMcp"
  | "docsClients"
  | "docsSdk"
  | "docsTroubleshooting"
  | "transparency"
  | "testdata"
  | "privacy"
  | "services"
  | "accuracy"
  | "security"
  | "about"
  | "faq"
  | "industries"

export const SITE_ORIGIN = "https://maskera.dev"

export const pathsByLocale: Record<Locale, Record<View, string>> = {
  sv: {
    demo: "/",
    docs: "/docs",
    docsMcp: "/docs/mcp",
    docsClients: "/docs/klienter",
    docsSdk: "/docs/sdk",
    docsTroubleshooting: "/docs/felsokning",
    transparency: "/integritet",
    testdata: "/testdata",
    privacy: "/integritetspolicy",
    services: "/tjanster",
    accuracy: "/traffsakerhet",
    security: "/sakerhet",
    about: "/om",
    faq: "/fragor",
    industries: "/branscher",
  },
  en: {
    demo: "/en",
    docs: "/en/docs",
    docsMcp: "/en/docs/mcp",
    docsClients: "/en/docs/clients",
    docsSdk: "/en/docs/sdk",
    docsTroubleshooting: "/en/docs/troubleshooting",
    transparency: "/en/privacy",
    testdata: "/en/test-data",
    privacy: "/en/privacy-policy",
    services: "/en/services",
    accuracy: "/en/accuracy",
    security: "/en/security",
    about: "/en/about",
    faq: "/en/faq",
    industries: "/en/industries",
  },
}

/** Every HTML page the site serves, both locales, in sitemap order. */
export const PAGE_PATHS: readonly string[] = [
  ...Object.values(pathsByLocale.sv),
  ...Object.values(pathsByLocale.en),
]

/**
 * The Markdown sibling of a page: `/` -> `/index.md`, `/tjanster` ->
 * `/tjanster.md`, `/en` -> `/en.md`. scripts/prerender.mjs writes these
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
  "/developers": "/en/docs",
  // Former pages, merged into the docs on 2026-11-28; old links keep working.
  "/utvecklare": "/docs",
  "/en/developers": "/en/docs",
  "/guider": "/docs/klienter",
  "/en/guides": "/en/docs/clients",
  "/about": "/en/about",
  "/contact": "/en/about#kontakt",
  "/privacy": "/en/privacy-policy",
  "/tillagg": "/tjanster",
  "/extension": "/en/services",
}

/** Machine-readable files served from the site root (public/ or build output). */
export const WELL_KNOWN_FILES: readonly string[] = [
  "/llms.txt",
  "/setup-prompt.md",
  "/sitemap.xml",
  "/robots.txt",
  "/benchmark-release.json",
  "/benchmark-release.schema.json",
  "/whitepaper.pdf",
]
