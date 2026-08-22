// Build-time HTML -> Markdown for the page's text/markdown representation
// (see scripts/prerender.mjs and middleware.ts). The prerendered React
// markup is pruned of everything that only makes sense with a pointer or a
// script (toolbars, toggles, the live demo's editor and result cards) and the
// rest is converted with turndown + GFM tables, so headings, paragraphs,
// lists, links, code blocks and tables survive and copy stays identical to
// the HTML page because it IS the HTML page.

import { JSDOM } from "jsdom"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

/** Elements that are chrome or interactive on every page. */
const DROP_EVERYWHERE = [
  "script",
  "style",
  "svg",
  "button",
  "textarea",
  "input",
  "select",
  "form",
  '[aria-hidden="true"]',
  ".skip-link",
  ".head-row",
  ".topbar",
  ".back",
  ".backdrop",
  // In-page table of contents: the headings carry the structure in Markdown.
  ".toc-rail",
  // Copy variants that CSS swaps in on small screens; the desktop one stays.
  ".hero-local-production-mobile-copy",
  ".hero-local-production-mobile-cta",
]

/** Page-specific interactive regions (selectors per pathname prefix). */
const DROP_BY_PAGE = {
  // The live demo: scenario tabs, model status, the editor/output cards and
  // the simulated reply. The hero copy, the test-data note, the restore
  // explanation and the footer remain.
  demo: [".controls", ".grid", ".flow", "#restore-map", ".card-links", ".stats"],
}

function service() {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    hr: "---",
  })
  turndown.use(gfm)
  // <mark> is a highlight in the demo; in Markdown the text stands on its own.
  turndown.addRule("mark", {
    filter: "mark",
    replacement: (content) => content,
  })
  // turndown's default list item is "-   text" (three spaces); "- text" is
  // what people and agents expect.
  turndown.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const body = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "\n")
        .replace(/\n/gm, "\n  ")
      let prefix = `${options.bulletListMarker} `
      const parent = node.parentNode
      if (parent && parent.nodeName === "OL") {
        const start = parent.getAttribute("start")
        const index = Array.prototype.indexOf.call(parent.children, node)
        prefix = `${start ? Number(start) + index : index + 1}. `
      }
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "")
    },
  })
  // Keep anchors with only a fragment href relative to the page: turndown
  // would otherwise emit "[text](#id)", which is what we want, so nothing to
  // do, but protocol-less in-site links are made absolute below.
  return turndown
}

function absolutize(document, origin) {
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") ?? ""
    if (href.startsWith("/")) a.setAttribute("href", new URL(href, origin).href)
  }
  for (const img of document.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") ?? ""
    if (src.startsWith("/")) img.setAttribute("src", new URL(src, origin).href)
  }
}

/**
 * @param {string} html        rendered App markup for one route
 * @param {object} info
 * @param {string} info.view   route view name (drops per DROP_BY_PAGE)
 * @param {string} info.url    canonical URL of the HTML page
 * @param {string} info.lang   "sv" | "en"
 * @param {string} info.alternateUrl   the other locale's URL
 * @param {string} info.alternateLang  the other locale
 * @param {string} info.markdownUrl    absolute URL of this Markdown file
 * @param {string} info.description    meta description
 * @returns {string} Markdown document
 */
export function htmlToMarkdown(html, info) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)
  const { document } = dom.window
  const selectors = [...DROP_EVERYWHERE, ...(DROP_BY_PAGE[info.view] ?? [])]
  for (const node of document.querySelectorAll(selectors.join(","))) node.remove()
  absolutize(document, new URL(info.url).origin)

  const body = service()
    .turndown(document.body)
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  const preamble = [
    `> ${info.description}`,
    `>`,
    `> Canonical: ${info.url} (${info.lang}) · ${info.alternateLang}: ${info.alternateUrl} · Markdown: ${info.markdownUrl} · Overview for agents: ${new URL("/llms.txt", info.url).href}`,
  ].join("\n")

  // The H1 comes first in the body; slot the preamble right after it so a
  // reader (or an agent truncating early) sees title, summary, then content.
  const firstBreak = body.indexOf("\n\n")
  if (body.startsWith("# ") && firstBreak > 0) {
    return `${body.slice(0, firstBreak)}\n\n${preamble}\n\n${body.slice(firstBreak + 2)}\n`
  }
  return `${preamble}\n\n${body}\n`
}
