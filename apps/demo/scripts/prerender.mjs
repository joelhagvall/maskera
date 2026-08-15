// Post-build prerender: injects each route's rendered App markup into its
// dist HTML shell and inlines the CSS bundle, so pages paint from the served
// HTML alone (Lighthouse FCP/LCP) instead of waiting for the JS bundle and a
// render-blocking stylesheet request. main.tsx hydrates the markup on load.
//
// Run after both builds:
//   vite build && vite build --ssr src/entry-server.tsx --outDir dist-ssr
//   node scripts/prerender.mjs

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const dist = join(root, "dist")

const { renderRoute } = await import(pathToFileURL(join(root, "dist-ssr", "entry-server.js")).href)

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* htmlFiles(path)
    else if (name === "index.html") yield path
  }
}

const STYLESHEET_LINK = /<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>\s*/g
const THEME_INIT_TAG = '<script src="/theme-init.js"></script>'
const MODULE_SCRIPT = /<script type="module" crossorigin src="(\/assets\/[^"]+\.js)"><\/script>/
const EMPTY_ROOT = '<div id="root"></div>'

// Inlined into every page below, removing the last render-blocking request.
// script-src 'self' alone would block it, so vercel.json carries the
// content's sha256; scripts/check-theme-hash.mjs keeps that hash honest.
const themeInit = readFileSync(join(root, "public", "theme-init.js"), "utf8")
// Replaces Vite's <script type="module"> so the bundle starts after the first
// painted frame; same static-content/static-hash arrangement as theme-init.
const mainLoader = readFileSync(join(root, "public", "main-loader.js"), "utf8")

let count = 0
for (const file of htmlFiles(dist)) {
  // dist/utvecklare/index.html -> /utvecklare, dist/index.html -> /
  const dir = relative(dist, dirname(file)).replaceAll("\\", "/")
  const pathname = dir ? `/${dir}` : "/"

  let html = readFileSync(file, "utf8")

  if (!html.includes(THEME_INIT_TAG)) throw new Error(`no theme-init tag in ${file}`)
  html = html.replace(THEME_INIT_TAG, () => `<script>${themeInit}</script>`)

  // Inline every built stylesheet: CSP allows style-src 'unsafe-inline', and
  // the bundle uses absolute /fonts/... URLs, so depth-relative pages are safe.
  const styles = []
  html = html.replace(STYLESHEET_LINK, (_tag, href) => {
    styles.push(readFileSync(join(dist, href), "utf8"))
    return ""
  })
  if (styles.length === 0) throw new Error(`no stylesheet link found in ${file}`)
  html = html.replace("</head>", () => `<style>${styles.join("\n")}</style>\n  </head>`)

  const moduleTag = html.match(MODULE_SCRIPT)
  if (!moduleTag) throw new Error(`no module script in ${file}`)
  html = html.replace(
    moduleTag[0],
    () => `<script data-src="${moduleTag[1]}">${mainLoader}</script>`,
  )

  if (!html.includes(EMPTY_ROOT)) throw new Error(`no empty #root in ${file}`)
  html = html.replace(EMPTY_ROOT, () => `<div id="root">${renderRoute(pathname)}</div>`)

  writeFileSync(file, html)
  count += 1
}

console.log(`prerendered ${count} pages`)
