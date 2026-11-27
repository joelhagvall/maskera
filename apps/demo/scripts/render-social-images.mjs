#!/usr/bin/env node
/**
 * Render the link-preview images and the web app manifest icons into public/.
 *
 * - og.png / og-en.png (1200x630): the home page's Swedish and English Open
 *   Graph cards. The headline is the hero title, under it the start of the
 *   hero scene as the user writes it and as the AI sees it.
 * - og/<locale>/<view>.png (1200x630): one card per other page with its own
 *   title and description, so a shared link previews the page it points to.
 *   Titles, descriptions, paths and placeholder colours are loaded from
 *   src/meta.ts, src/heroScenes.ts and src/labels.ts through Vite, so a card
 *   cannot drift from the page. Rerun after changing a title or description;
 *   test/meta.test.ts fails while a card is missing.
 * - icon-192.png / icon-512.png: the favicon glyph, for the manifest.
 * - icon-maskable-512.png: full-bleed background with the glyph inside the
 *   maskable safe zone, so Android launchers can crop it to any shape.
 *
 * The output is committed (the build does not need a browser). Prereq, once:
 *   pnpm --filter @maskera/demo exec playwright install chromium
 *
 * Run:
 *   pnpm --filter @maskera/demo render:social
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
import { createServer } from "vite"
import { CARDS_LOCK, cardHash, PUBLIC, socialCards } from "./social-cards.mjs"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

const favicon = readFileSync(join(PUBLIC, "favicon.svg"), "utf8")
const faviconUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`

const vite = await createServer({
  root: ROOT,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
})
const [meta, scenes, labels, i18n] = await Promise.all([
  vite.ssrLoadModule("/src/meta.ts"),
  vite.ssrLoadModule("/src/heroScenes.ts"),
  vite.ssrLoadModule("/src/labels.ts"),
  vite.ssrLoadModule("/src/i18n/index.ts"),
])
await vite.close()

// The favicon is already a dark rounded tile. The plain icons show it as is;
// the maskable icon fills the canvas with its colour and keeps the glyph
// within the central 80% safe zone.
function iconHtml(size, maskable) {
  const glyph = maskable ? size * 0.8 : size
  return `<!doctype html><html><head><style>
  * { margin: 0; }
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center;
    background: ${maskable ? "#0a0a0a" : "transparent"}; }
  img { width: ${glyph}px; height: ${glyph}px; }
  </style></head><body><img src="${faviconUri}" alt=""></body></html>`
}

const browser = await chromium.launch()
try {
  const cards = socialCards({ meta, scenes, labels, i18n })
  for (const card of cards) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    await page.setContent(card.html)
    await page.evaluate(() => document.fonts.ready)
    mkdirSync(dirname(join(PUBLIC, card.file)), { recursive: true })
    await page.screenshot({ path: join(PUBLIC, card.file) })
    await page.close()
    console.log(`wrote public/${card.file}`)
  }
  const manifest = Object.fromEntries(cards.map((card) => [card.file, cardHash(card.html)]))
  writeFileSync(CARDS_LOCK, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log("wrote scripts/social-cards.lock.json")
  const icons = [
    { file: "icon-192.png", size: 192, maskable: false },
    { file: "icon-512.png", size: 512, maskable: false },
    { file: "icon-maskable-512.png", size: 512, maskable: true },
  ]
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await page.setContent(iconHtml(icon.size, icon.maskable))
    await page.screenshot({ path: join(PUBLIC, icon.file), omitBackground: !icon.maskable })
    await page.close()
    console.log(`wrote public/${icon.file}`)
  }
} finally {
  await browser.close()
}
