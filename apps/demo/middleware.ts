// Vercel routing middleware for maskera.dev (file convention: project root,
// edge runtime). It runs before the static filesystem and does three things
// for agents and other non-browser clients, leaving browsers untouched:
//
// 1. Markdown content negotiation (acceptmarkdown.com): a page request whose
//    Accept header prefers text/markdown over text/html is rewritten to the
//    page's Markdown sibling that scripts/prerender.mjs wrote into dist/
//    (/ -> /index.md, /utvecklare -> /utvecklare.md). HTML responses carry
//    Vary: Accept and a Link rel="alternate" to the Markdown so caches and
//    agents can find the other representation. An Accept header that rules
//    out both is answered 406 with the available types.
// 2. Real 404s with a useful body: unknown extensionless paths get a 404 in
//    Markdown (default), JSON (Accept: application/json, or anything under
//    /api/) or HTML (browsers), each pointing at llms.txt, the sitemap, the
//    docs and the OpenAPI contract instead of Vercel's bare NOT_FOUND text.
// 3. Everything with a file extension (assets, fonts, models, the .md files
//    themselves, llms.txt, the PDF) and every vercel.json redirect alias
//    passes straight through.
//
// Pure logic lives in src/negotiate.ts, src/agent-responses.ts and
// src/paths.ts so test/middleware.test.ts can drive this handler directly.

import { next, rewrite } from "@vercel/functions/middleware"
import {
  notAcceptableJson,
  notFoundHtml,
  notFoundJson,
  notFoundMarkdown,
} from "./src/agent-responses"
import { selectMediaType } from "./src/negotiate"
import { ALIAS_REDIRECTS, markdownPathFor, PAGE_PATHS } from "./src/paths"

export const config = {
  // Hashed bundles, fonts, model weights and the ONNX runtime never need
  // negotiation; skipping them in the matcher also skips the invocation.
  matcher: ["/((?!assets/|models/|fonts/|ort/).*)"],
}

const PAGE_TYPES = ["text/html", "text/markdown"] as const
const NOT_FOUND_TYPES = ["text/markdown", "application/json", "text/html"] as const
const HAS_EXTENSION = /\.[A-Za-z0-9]+$/

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/"
}

function body(request: Request, text: string): string | null {
  return request.method === "HEAD" ? null : text
}

function notFound(request: Request, pathname: string, forceJson: boolean): Response {
  const accept = request.headers.get("accept")
  const type = forceJson
    ? "application/json"
    : (selectMediaType(accept, NOT_FOUND_TYPES) ?? "text/markdown")
  const headers = {
    "Content-Type": `${type}; charset=utf-8`,
    Vary: "Accept",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  }
  if (type === "application/json") {
    return new Response(body(request, notFoundJson(pathname)), { status: 404, headers })
  }
  if (type === "text/html") {
    return new Response(body(request, notFoundHtml(pathname)), { status: 404, headers })
  }
  return new Response(body(request, notFoundMarkdown(pathname)), { status: 404, headers })
}

export default function middleware(request: Request): Response {
  const url = new URL(request.url)
  const pathname = normalizePath(url.pathname)

  // No hosted API exists; answer API-shaped probes in JSON so agents can parse
  // the error and the hint about where masking actually runs.
  if (pathname === "/api" || pathname.startsWith("/api/")) return notFound(request, pathname, true)

  // Static files (incl. the .md siblings and llms.txt) and the vercel.json
  // redirect aliases continue to the platform untouched.
  if (HAS_EXTENSION.test(pathname) || pathname in ALIAS_REDIRECTS) return next()

  if (!PAGE_PATHS.includes(pathname)) return notFound(request, pathname, false)

  // Only GET/HEAD carry a representation worth negotiating.
  if (request.method !== "GET" && request.method !== "HEAD") return next()

  const markdownPath = markdownPathFor(pathname)
  const chosen = selectMediaType(request.headers.get("accept"), PAGE_TYPES)
  if (chosen === null) {
    return new Response(body(request, notAcceptableJson(pathname, PAGE_TYPES)), {
      status: 406,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Vary: "Accept",
        "Cache-Control": "no-store",
      },
    })
  }
  if (chosen === "text/markdown") {
    return rewrite(new URL(markdownPath, request.url), {
      headers: {
        Vary: "Accept",
        "Content-Location": markdownPath,
        Link: `<${pathname}>; rel="canonical"; type="text/html"`,
      },
    })
  }
  return next({
    headers: {
      Vary: "Accept",
      Link: `<${markdownPath}>; rel="alternate"; type="text/markdown"`,
    },
  })
}
