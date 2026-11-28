#!/usr/bin/env node
/**
 * Full-page screenshots of every page in public/sitemap.xml, desktop and
 * mobile, plus one contact sheet per viewport, for reviewing the whole site
 * side by side (symmetry, colour, coherence) instead of page by page.
 *
 * The page list comes from the sitemap, which paths.ts keeps in step, so a
 * new page is captured without touching this script.
 *
 * Prereq, once:
 *   pnpm --filter @maskera/demo exec playwright install chromium
 *
 * Run against a running dev server or preview (default http://127.0.0.1:5179):
 *   pnpm --filter @maskera/demo capture:pages [--base=URL] [--lang=sv|en|all] [--theme=light|dark]
 *     [--only=/tjanster,/en/services]
 *
 * --only keeps just the listed sitemap paths (after --lang), for checking one
 * page before and after an edit without shooting the whole site.
 *
 * Writes to reports/pages/ (gitignored): <viewport>-<slug>.png,
 * sheet-<viewport>.html (a contact sheet with every page in one row) and
 * metrics.json (h1 size, TOC rail box, page height, sideways overflow per
 * page), so symmetry is compared in numbers, not by eye. Exits non-zero when
 * a page scrolls sideways.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const OUT = join(ROOT, "reports", "pages")

const VIEWPORTS = [
  { id: "desktop", width: 1440, height: 900, isMobile: false },
  { id: "mobile", width: 390, height: 844, isMobile: true },
]

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

/** Sitemap paths for the chosen language: sv = the root locale, en = /en. */
export function sitemapPaths(xml, lang) {
  const all = [...xml.matchAll(/hreflang="(sv|en)" href="https:\/\/maskera\.dev([^"]*)"/g)].map(
    (m) => ({ lang: m[1], path: m[2] || "/" }),
  )
  const unique = [...new Map(all.map((p) => [`${p.lang}${p.path}`, p])).values()]
  return unique.filter((p) => lang === "all" || p.lang === lang).map((p) => p.path)
}

/**
 * Load every image before the full-page screenshot, lazy ones included: a
 * full-page capture never scrolls, so a loading="lazy" image below the fold
 * would show as an empty frame. Returns the src of every shown image that
 * still has no pixels, which the run reports as an error.
 */
export async function loadEveryImage(page) {
  return page.evaluate(async () => {
    const images = [...document.images]
    for (const img of images) img.loading = "eager"
    const settled = (img) =>
      img.complete
        ? null
        : new Promise((done) => {
            img.addEventListener("load", done, { once: true })
            img.addEventListener("error", done, { once: true })
          })
    const timeout = new Promise((done) => setTimeout(done, 10_000))
    await Promise.race([Promise.all(images.map(settled)), timeout])
    return images
      .filter((img) => getComputedStyle(img).display !== "none" && img.naturalWidth === 0)
      .map((img) => img.getAttribute("src"))
  })
}

/** Keep only the comma-separated `only` paths; an empty list keeps them all. */
export function onlyPaths(paths, only, lang = "sv") {
  const wanted = only
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  if (wanted.length === 0) return paths
  const unknown = wanted.filter((p) => !paths.includes(p))
  if (unknown.length > 0) {
    // prova and this script check one locale per run (--lang, default sv).
    const hint =
      lang === "sv" ? " (English pages need --lang=en)" : " (Swedish pages need --lang=sv)"
    throw new Error(`--only paths not in the ${lang} sitemap: ${unknown.join(", ")}${hint}`)
  }
  return paths.filter((p) => wanted.includes(p))
}

function slug(path) {
  return path === "/" ? "hem" : path.replace(/^\//, "").replaceAll("/", "-")
}

async function main() {
  const base = arg("base", "http://127.0.0.1:5179").replace(/\/$/, "")
  const lang = arg("lang", "sv")
  const theme = arg("theme", "light")
  const only = arg("only", "")
  const paths = onlyPaths(
    sitemapPaths(readFileSync(join(ROOT, "public", "sitemap.xml"), "utf8"), lang),
    only,
    lang,
  )
  if (paths.length === 0) throw new Error(`no sitemap pages for --lang=${lang} --only=${only}`)
  mkdirSync(OUT, { recursive: true })

  const metrics = []
  const browser = await chromium.launch()
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        colorScheme: theme,
        reducedMotion: "reduce",
      })
      const page = await context.newPage()
      const pageErrors = []
      page.on("pageerror", (err) => pageErrors.push(`pageerror: ${err.message}`))
      page.on("console", (msg) => {
        if (msg.type() === "error") pageErrors.push(`console.error: ${msg.text()}`)
      })
      const shots = []
      for (const path of paths) {
        const beforeCount = pageErrors.length
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" })
        await page.evaluate((t) => {
          document.documentElement.dataset.theme = t
        }, theme)
        const metric = await page.evaluate(() => {
          const box = (el) => {
            if (!el) return null
            const b = el.getBoundingClientRect()
            return {
              left: Math.round(b.left),
              right: Math.round(b.right),
              top: Math.round(b.top + scrollY),
            }
          }
          const h1 = document.querySelector("h1")
          return {
            h1: h1 ? getComputedStyle(h1).fontSize : null,
            rail: box(document.querySelector(".toc-rail")),
            height: document.documentElement.scrollHeight,
            overflowX: document.documentElement.scrollWidth - innerWidth,
          }
        })
        const brokenImages = await loadEveryImage(page)
        for (const src of brokenImages) pageErrors.push(`image did not load: ${src}`)
        const routeErrors = pageErrors.slice(beforeCount)
        metrics.push({ viewport: vp.id, theme, path, ...metric, consoleErrors: routeErrors })
        const file = `${vp.id}-${slug(path)}.png`
        await page.screenshot({ path: join(OUT, file), fullPage: true })
        shots.push({ path, file })
        process.stdout.write(`${vp.id} ${path}\n`)
      }
      await context.close()
      const cells = shots
        .map(
          (s) =>
            `<figure><figcaption>${s.path}</figcaption><img src="${s.file}" alt="${s.path}"></figure>`,
        )
        .join("\n")
      writeFileSync(
        join(OUT, `sheet-${vp.id}.html`),
        `<!doctype html><meta charset="utf-8"><title>maskera ${vp.id}</title>
<style>
body{margin:0;padding:24px;background:#e9e9ec;font:13px system-ui;display:flex;gap:24px;align-items:flex-start;width:max-content}
figure{margin:0;width:${vp.width}px}figcaption{margin:0 0 8px;font-weight:600}
img{display:block;width:100%;box-shadow:0 1px 4px rgb(0 0 0/.15)}
</style>
${cells}`,
      )
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(OUT, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`)
  process.stdout.write(`wrote ${OUT}\n`)
  const overflowing = metrics.filter((m) => m.overflowX > 0)
  if (overflowing.length > 0) {
    for (const m of overflowing)
      process.stderr.write(`${m.viewport} ${m.path} scrolls sideways by ${m.overflowX}px\n`)
    process.exitCode = 1
  }
  const withErrors = metrics.filter((m) => (m.consoleErrors?.length ?? 0) > 0)
  if (withErrors.length > 0) {
    for (const m of withErrors) {
      for (const err of m.consoleErrors) {
        process.stderr.write(`${m.viewport} (${m.theme}) ${m.path} ${err}\n`)
      }
    }
    process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
