// Bodies for the responses the routing middleware generates itself: the
// negotiated 404 (Markdown for agents, JSON for API-style clients, HTML for
// browsers) and the 406 when an Accept header rules out every representation.
// Dependency-free: bundled into the edge middleware.

import { SITE_ORIGIN } from "./paths"

export const OPENAPI_PATH = "/openapi.json"
export const OPENAPI_CANONICAL = "https://app.maskera.dev/gateway/openapi.json"

const LINKS = {
  llms: `${SITE_ORIGIN}/llms.txt`,
  sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  docs: `${SITE_ORIGIN}/en/developers`,
  docsMarkdown: `${SITE_ORIGIN}/en/developers.md`,
  openapi: `${SITE_ORIGIN}${OPENAPI_PATH}`,
  about: `${SITE_ORIGIN}/en/about`,
  source: "https://github.com/joelhagvall/maskera",
} as const

const NO_API_HINT =
  "maskera.dev hosts no HTTP masking API: masking runs in your own browser, Node.js process or self-hosted Maskera Gateway. Use the npm packages (maskera, @maskera/core) or Gateway, whose API is described by /openapi.json."

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Keeps a requested path safe to echo: printable, bounded, no markup. */
export function displayPath(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Malformed percent-encoding: show the raw path.
  }
  const clean = decoded.replace(/[^\x20-\x7e]/g, "").replace(/[`<>"]/g, "")
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean
}

export function notFoundMarkdown(pathname: string): string {
  const path = displayPath(pathname)
  return `# 404: nothing at ${path} on maskera.dev

maskera.dev is the public site for Maskera: Swedish-first, client-side PII redaction for AI apps (open-source npm packages plus the self-hosted Maskera Gateway). The path \`${path}\` does not exist here.

${NO_API_HINT}

Where to look next:

- Start here: ${LINKS.llms} (what Maskera is, when to use it, how to call it)
- Sitemap: ${LINKS.sitemap}
- Developer docs: ${LINKS.docs} (Swedish: ${SITE_ORIGIN}/utvecklare), Markdown: ${LINKS.docsMarkdown}
- Gateway OpenAPI: ${LINKS.openapi} (redirects to ${OPENAPI_CANONICAL})
- About and contact: ${LINKS.about}
- Source code: ${LINKS.source}

Every page is also served as Markdown: send \`Accept: text/markdown\` or append \`.md\` to the path (for example \`/index.md\` or \`/en/developers.md\`).
`
}

export function notFoundJson(pathname: string): string {
  return `${JSON.stringify(
    {
      error: {
        code: "not_found",
        status: 404,
        message: `No resource at ${displayPath(pathname)} on maskera.dev.`,
        hint: NO_API_HINT,
        links: LINKS,
      },
    },
    null,
    2,
  )}\n`
}

export function notAcceptableJson(pathname: string, available: readonly string[]): string {
  return `${JSON.stringify(
    {
      error: {
        code: "not_acceptable",
        status: 406,
        message: `${displayPath(pathname)} is available as ${available.join(" or ")}; the Accept header ruled both out.`,
        hint: "Send Accept: text/markdown for the Markdown rendering or Accept: text/html for the page. See /llms.txt for machine-readable entry points.",
        available,
        links: LINKS,
      },
    },
    null,
    2,
  )}\n`
}

type Strings = {
  lang: string
  title: string
  lede: string
  home: string
  docs: string
  about: string
  llms: string
}

const STRINGS: Record<"sv" | "en", Strings> = {
  sv: {
    lang: "sv",
    title: "Sidan finns inte",
    lede: "Det finns ingen sida på den här adressen. maskera.dev maskerar svenska personuppgifter innan text når AI, direkt i webbläsaren eller på egna servrar.",
    home: "Till startsidan",
    docs: "För utvecklare",
    about: "Om Maskera och kontakt",
    llms: "Maskinläsbar översikt (llms.txt)",
  },
  en: {
    lang: "en",
    title: "Page not found",
    lede: "There is no page at this address. maskera.dev masks Swedish personal data before text reaches AI, in the browser or on your own servers.",
    home: "Go to the start page",
    docs: "For developers",
    about: "About Maskera and contact",
    llms: "Machine-readable overview (llms.txt)",
  },
}

export function notFoundHtml(pathname: string): string {
  const english = pathname === "/en" || pathname.startsWith("/en/")
  const t = english ? STRINGS.en : STRINGS.sv
  const home = english ? "/en" : "/"
  const docs = english ? "/en/developers" : "/utvecklare"
  const about = english ? "/en/about" : "/om"
  const path = escapeHtml(displayPath(pathname))
  // Same tokens and font as the app's styles.css so the page reads as part of
  // the site; the theme follows the stored choice like theme-init.js does.
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>404 · maskera</title>
<style>
@font-face{font-family:"Geist";font-style:normal;font-weight:100 900;font-display:swap;src:url("/fonts/geist-latin.woff2") format("woff2")}
:root{color-scheme:light;--bg:#ffffff;--fg:#000000;--muted:#666666;--border:#eaeaea}
html[data-theme="dark"]{color-scheme:dark;--bg:#0a0a0a;--fg:#ededed;--muted:#a1a1a1;--border:#262626}
html,body{margin:0;background:var(--bg);color:var(--fg);font-family:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:640px;margin:0 auto;padding:72px 24px 96px}
h1{font-size:32px;line-height:1.15;letter-spacing:-.03em;margin:0 0 16px}
p{font-size:16px;line-height:1.6;color:var(--muted);margin:0 0 12px}
code{font-family:"Geist Mono",ui-monospace,Menlo,monospace;font-size:14px}
ul{list-style:none;padding:0;margin:28px 0 0;border-top:1px solid var(--border)}
li{border-bottom:1px solid var(--border)}
a{display:block;padding:14px 0;color:var(--fg);text-decoration:none}
a:hover{text-decoration:underline}
</style>
</head>
<body>
<main>
<h1>404 · ${t.title}</h1>
<p>${t.lede}</p>
<p><code>${path}</code></p>
<ul>
<li><a href="${home}">${t.home}</a></li>
<li><a href="${docs}">${t.docs}</a></li>
<li><a href="${about}">${t.about}</a></li>
<li><a href="/llms.txt">${t.llms}</a></li>
</ul>
</main>
</body>
</html>
`
}
