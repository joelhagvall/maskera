#!/usr/bin/env node
/**
 * Render the link-preview images and the web app manifest icons into public/.
 *
 * - og.png / og-en.png (1200x630): the Swedish and English Open Graph cards.
 *   The headline is the hero title from src/i18n, so the card cannot drift
 *   from the page it previews. Rerun after changing header.title.
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
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const PUBLIC = join(ROOT, "public")

const font = (file) =>
  `data:font/woff2;base64,${readFileSync(join(PUBLIC, "fonts", file)).toString("base64")}`
const favicon = readFileSync(join(PUBLIC, "favicon.svg"), "utf8")
const faviconUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`
const copy = (locale) =>
  JSON.parse(readFileSync(join(ROOT, "src", "i18n", `${locale}.json`), "utf8"))

// The masked line matches the README and the developer page example. Maskera
// only reads Swedish, so the sample stays Swedish on the English card too.
const CARDS = [
  {
    file: "og.png",
    locale: "sv",
    footerStrong: "Endast maskerad text går vidare.",
    footer: "I webbläsaren eller i er egen miljö.",
  },
  {
    file: "og-en.png",
    locale: "en",
    footerStrong: "Only masked text is forwarded.",
    footer: "In the browser or in your own environment.",
  },
]

const fontFaces = `
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(${font("geist-latin.woff2")}) format("woff2"); }
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(${font("geist-latin-ext.woff2")}) format("woff2"); unicode-range: U+0100-024F, U+1E00-1EFF; }
  @font-face { font-family: "Geist Mono"; font-weight: 100 900; src: url(${font("geist-mono-latin.woff2")}) format("woff2"); }
`

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function cardHtml({ locale, footerStrong, footer }) {
  const title = escapeHtml(copy(locale).header.title)
  const token = (label) => `<span class="token">[${label}]</span>`
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
  ${fontFaces}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; padding: 72px 80px; background: #fff; color: #000;
    font-family: "Geist", sans-serif; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 20px; font-size: 34px; font-weight: 600; letter-spacing: -0.02em; }
  .brand img { width: 56px; height: 56px; }
  h1 { margin-top: 56px; font-size: 68px; line-height: 1.05; font-weight: 700; letter-spacing: -0.035em; max-width: 1000px; }
  .sample { margin-top: 40px; font-family: "Geist Mono", monospace; font-size: 26px; line-height: 1.6; color: #525252; }
  .token { color: #000; font-weight: 600; background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 1px 8px; white-space: nowrap; }
  footer { margin-top: auto; display: flex; justify-content: space-between; font-size: 24px; color: #525252; }
  footer strong { color: #000; font-weight: 600; }
  </style></head><body>
  <div class="brand"><img src="${faviconUri}" alt="">maskera</div>
  <h1>${title}</h1>
  <p class="sample">hej jag heter ${token("NAMN_1")}, personnummer ${token("PERSONNUMMER_1")}, och bor i ${token("PLATS_1")}</p>
  <footer><span><strong>${escapeHtml(footerStrong)}</strong> ${escapeHtml(footer)}</span><span>maskera.dev</span></footer>
  </body></html>`
}

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
  for (const card of CARDS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
    await page.setContent(cardHtml(card))
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(PUBLIC, card.file) })
    await page.close()
    console.log(`wrote public/${card.file}`)
  }
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
