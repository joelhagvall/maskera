#!/usr/bin/env node
/**
 * Render the independent-benchmark section of docs/BENCHMARKS.md from the
 * result file, so the report never carries a hand-copied number.
 *
 *   node bench/independent/render-markdown.mjs          # rewrite the section
 *   node bench/independent/render-markdown.mjs --check  # exit 1 on drift
 *
 * scripts/check-benchmark-sync.mjs runs the same comparison on every build.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
export const START = "<!-- independent-benchmark:start -->"
export const END = "<!-- independent-benchmark:end -->"

const NAMES = {
  maskera: "Maskera v21 (q4)",
  presidio: "Microsoft Presidio 2.2.366 + sv_core_news_lg 3.8.0",
  "swedish-pii": "swedish-pii 1.2.0",
  "openai-privacy-filter": "OpenAI Privacy Filter (q4 ONNX)",
}
const ORDER = ["maskera", "presidio", "swedish-pii", "openai-privacy-filter"]
const CELLS = [
  ["names", "Names"],
  ["namesLowercase", "Lowercase names"],
  ["places", "Places"],
  ["addresses", "Street addresses + postcodes"],
]
const CORPUS_TITLES = {
  "suc3-test-cased": "SUC 3.0 test split, normal casing",
  "suc3-test-lower": "SUC 3.0 test split, lowercased",
  "multiconer-sv": "MultiCoNER v2 Swedish test split (persons only)",
  "ai4privacy-sv": "ai4privacy openpii, Swedish validation rows",
  "sic2-sv": "SIC2 Swedish blogs (Språkbanken Text)",
}

const pct = (x) => (x == null ? "not measured" : `${x.toFixed(1)}%`)
const count = (n) => n.toLocaleString("en-US")

export function renderSection(result) {
  const lines = [START, "", "## Independent Swedish benchmark (what maskera.dev shows)", ""]
  lines.push(
    "Measured 2026-11-27 on CPU, on Swedish text that neither Maskera nor its",
    "developer wrote, and that is not in Maskera's training (v21 trains only on",
    "`training/generate_data.mjs` output). Every system ran on the same texts and",
    "is scored by one rule set (`bench/independent/score.mjs`). **Hidden** means the",
    "value is overlapped by any detection, whatever its label: what a masking",
    "product is judged on. Pooled cells count each independent sentence once.",
    "",
    "| System | Names | Lowercase names | Places | Street addresses + postcodes | Entity-free sentences with a hit (SUC + SIC2) |",
    "|---|---|---|---|---|---|",
  )
  for (const system of ORDER) {
    const s = result.summary[system]
    if (!s) continue
    const cells = CELLS.map(([key]) => {
      const c = s[key]
      return c ? `${pct(c.maskedPct)} (${count(c.masked)}/${count(c.total)})` : "not measured"
    })
    const over = s.overMasking
      ? `${pct(s.overMasking.pct)} (${count(s.overMasking.withDetection)}/${count(s.overMasking.sentences)})`
      : "not measured"
    const name = system === "maskera" ? `**${NAMES[system]}**` : NAMES[system]
    lines.push(`| ${name} | ${cells.join(" | ")} | ${over} |`)
  }
  lines.push("", "### Per corpus (hidden share and typed F1)", "")
  for (const [corpus, bySystem] of Object.entries(result.results)) {
    const meta = result.corpora[corpus]
    const types = Object.keys(Object.values(bySystem)[0]?.byType ?? {})
    lines.push(
      `**${CORPUS_TITLES[corpus] ?? corpus}**: ${count(meta.texts)} texts, ${count(meta.goldSpans)} gold spans, sha256 \`${meta.sha256}\``,
      "",
      `| System | ${types.map((t) => `${t} hidden / F1`).join(" | ")} |`,
      `|---|${types.map(() => "---").join("|")}|`,
    )
    for (const system of ORDER) {
      const m = bySystem[system]
      if (!m) continue
      const cells = types.map(
        (t) => `${pct(m.byType[t].maskedRecallPct)} / ${pct(m.byType[t].f1Pct)}`,
      )
      lines.push(`| ${NAMES[system]} | ${cells.join(" | ")} |`)
    }
    lines.push("")
  }
  lines.push(
    "Notes:",
    "",
    "- Presidio's spaCy model `sv_core_news_lg` is trained on SUC 3.0, so it is in-domain on the SUC rows.",
    "- KB-BERT, Maskera's base model, was pretrained by the National Library of Sweden on broad Swedish text and may have seen the same source texts, never the labels.",
    "- MultiCoNER v2 scores persons only: its place and organisation labels mark common words and the split injects typos.",
    "- ai4privacy types marked `*` (phone, personnummer, card) hold many values that are not valid Swedish formats; they are reported here but not on the site.",
    "- SIC2 (Stockholm Internet Corpus v2, Språkbanken Text, DOI 10.23695/se5f-d274) is manually annotated informal Swedish blog text; sentences with any other `<name>` type (work, animal, product, time) are excluded from the entity-free over-masking count.",
    "- Adjacent detections of the same type are merged for every system (swedish-pii splits first and last names).",
    "- The author-written suites below remain internal release gates and are not shown on maskera.dev.",
    "",
    END,
  )
  return lines.join("\n")
}

export function replaceSection(markdown, section) {
  const start = markdown.indexOf(START)
  const end = markdown.indexOf(END)
  if (start < 0 || end < 0)
    throw new Error("independent-benchmark markers missing in BENCHMARKS.md")
  return markdown.slice(0, start) + section + markdown.slice(end + END.length)
}

function main() {
  const result = JSON.parse(
    readFileSync(resolve(repoRoot, "docs/benchmark-independent-v21.json"), "utf8"),
  )
  const path = resolve(repoRoot, "docs/BENCHMARKS.md")
  const markdown = readFileSync(path, "utf8")
  const next = replaceSection(markdown, renderSection(result))
  if (process.argv.includes("--check")) {
    if (next !== markdown) {
      console.error(
        "docs/BENCHMARKS.md independent section is stale: run node bench/independent/render-markdown.mjs",
      )
      process.exit(1)
    }
    return
  }
  writeFileSync(path, next)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
