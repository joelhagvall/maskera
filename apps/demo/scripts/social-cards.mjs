/**
 * The link-preview cards as HTML, shared by render-social-images.mjs (which
 * screenshots them) and test/meta.test.ts (which hashes them against
 * scripts/social-cards.lock.json, so a changed title or description fails until the
 * cards are rendered again). Pure apart from reading fonts and the favicon.
 *
 * `modules` are the app's own src/meta.ts, src/heroScenes.ts, src/labels.ts
 * and src/i18n/index.ts, loaded by Vite in the script and by Vitest in tests.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
export const PUBLIC = join(ROOT, "public")

/** The input hash of every committed card, kept out of public/ so it is not served. */
export const CARDS_LOCK = join(ROOT, "scripts", "social-cards.lock.json")

const font = (file) =>
  `data:font/woff2;base64,${readFileSync(join(PUBLIC, "fonts", file)).toString("base64")}`
const favicon = readFileSync(join(PUBLIC, "favicon.svg"), "utf8")
const faviconUri = `data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`

const LOCALES = ["sv", "en"]

const fontFaces = `
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(${font("geist-latin.woff2")}) format("woff2"); }
  @font-face { font-family: "Geist"; font-weight: 100 900; src: url(${font("geist-latin-ext.woff2")}) format("woff2"); unicode-range: U+0100-024F, U+1E00-1EFF; }
`

const baseCss = `
  ${fontFaces}
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; padding: 64px 80px; background: #fff; color: #09090b;
    font-family: "Geist", sans-serif; display: flex; flex-direction: column; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 32px; font-weight: 600; letter-spacing: -0.02em; }
  .brand img { width: 52px; height: 52px; }
  .url { font-size: 24px; color: #52525b; }
`

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Placeholder colours from labels.ts, the same recipe as the site's tokens. */
function piiStyle(labels, label) {
  const color = labels.labelMeta(label).color
  return `--pii:${color};--pii-bg:${color}1a;--pii-hl:${color}29`
}

/** The original text with each replaced value underlined in its category colour. */
function markedPrompt({ scenes, labels }, { prompt, masked }) {
  const map = scenes.restoreMap(prompt, masked)
  return escapeHtml(masked).replace(/\[([A-ZÅÄÖ_]+)_\d+\]/g, (token, label) => {
    return `<mark style="${piiStyle(labels, label)}">${escapeHtml(map[token])}</mark>`
  })
}

function maskedText({ labels }, masked) {
  return escapeHtml(masked).replace(/\[([A-ZÅÄÖ_]+)_\d+\]/g, (token, label) => {
    return `<span class="token" style="${piiStyle(labels, label)}">${token}</span>`
  })
}

function homeCardHtml(modules, locale) {
  const copy = modules.i18n.copies[locale]
  const sample = modules.scenes.OG_SAMPLE
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
  ${baseCss}
  h1 { margin-top: 44px; font-size: 64px; line-height: 1.06; font-weight: 700; letter-spacing: -0.035em; max-width: 980px; }
  .sample { margin-top: auto; border: 1px solid #e4e4e7; border-radius: 6px; }
  .row { padding: 18px 24px; }
  .row + .row { border-top: 1px solid #e4e4e7; background: #fafafa; }
  .label { font-size: 19px; color: #71717a; margin-bottom: 6px; }
  .text { font-size: 27px; line-height: 1.4; letter-spacing: -0.01em; white-space: nowrap; }
  mark { color: inherit; background: var(--pii-hl); box-shadow: inset 0 -3px 0 var(--pii); border-radius: 3px; padding: 0 2px; }
  .token { color: var(--pii); background: var(--pii-bg); font-weight: 600; border-radius: 3px; padding: 0 5px; }
  </style></head><body>
  <div class="top"><div class="brand"><img src="${faviconUri}" alt="">maskera</div><span class="url">maskera.dev</span></div>
  <h1>${escapeHtml(copy.header.title)}</h1>
  <div class="sample">
    <div class="row"><p class="label">${escapeHtml(copy.inputCard.title)}</p><p class="text" lang="sv">${markedPrompt(modules, sample)}</p></div>
    <div class="row"><p class="label">${escapeHtml(copy.outputCard.title)}</p><p class="text" lang="sv">${maskedText(modules, sample.masked)}</p></div>
  </div>
  </body></html>`
}

function pageCardHtml({ meta }, view, locale) {
  const page = meta.pageMeta(locale)[view]
  const url = meta
    .viewUrl(view, locale)
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "")
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>
  ${baseCss}
  h1 { margin-top: auto; font-size: 72px; line-height: 1.05; font-weight: 700; letter-spacing: -0.035em; max-width: 1000px; }
  p.desc { margin-top: 28px; font-size: 30px; line-height: 1.4; color: #52525b; max-width: 1000px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  footer { margin-top: auto; padding-top: 24px; border-top: 1px solid #e4e4e7; font-size: 24px; color: #52525b; }
  </style></head><body>
  <div class="top"><div class="brand"><img src="${faviconUri}" alt="">maskera</div></div>
  <h1>${escapeHtml(page.title)}</h1>
  <p class="desc">${escapeHtml(page.description)}</p>
  <footer>${escapeHtml(url)}</footer>
  </body></html>`
}

/** Every card to render: the home card per locale and one per other routed page. */
export function socialCards(modules) {
  const { meta } = modules
  return LOCALES.flatMap((locale) =>
    ["demo", ...meta.routeHtmlViews].map((view) => ({
      file: meta.ogImagePath(view, locale).slice(1),
      html: view === "demo" ? homeCardHtml(modules, locale) : pageCardHtml(modules, view, locale),
    })),
  )
}

/** A short, stable hash of a card's HTML: changes whenever its rendered input does. */
export function cardHash(html) {
  return createHash("sha256").update(html).digest("hex").slice(0, 16)
}
