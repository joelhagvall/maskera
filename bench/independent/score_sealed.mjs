#!/usr/bin/env node
/**
 * Score all systems over the untouched Swedish sealed-holdout corpora.
 * Strictly aggregate-only output (never prints raw holdout sentences).
 *
 * Usage:
 *   node bench/independent/score_sealed.mjs --corpora tmp/indep/sealed_corpora --preds tmp/indep/sealed_preds --out tmp/indep/sealed_score.json
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const corporaDir = resolve(flag("--corpora", "tmp/indep/sealed_corpora"))
const predsDir = resolve(flag("--preds", "tmp/indep/sealed_preds"))
const outPath = resolve(flag("--out", "tmp/indep/sealed_score.json"))

const overlap = (a, b) => Math.max(a.start, b.start) < Math.min(a.end, b.end)

const corpora = {}
for (const file of readdirSync(corporaDir)
  .filter((f) => f.endsWith(".jsonl"))
  .sort()) {
  const name = basename(file, ".jsonl")
  corpora[name] = readFileSync(resolve(corporaDir, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

const systems = readdirSync(predsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const results = {}
for (const [cname, rows] of Object.entries(corpora)) {
  results[cname] = {}
  for (const sys of systems) {
    const pfile = resolve(predsDir, sys, `${cname}.jsonl`)
    let predMap
    try {
      predMap = new Map(
        readFileSync(pfile, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const obj = JSON.parse(line)
            return [obj.id, obj.preds]
          }),
      )
    } catch {
      continue
    }

    const byType = {}
    let cleanTotal = 0
    let cleanHit = 0
    let cleanSpans = 0

    for (const row of rows) {
      const preds = predMap.get(row.id) ?? []
      if (row.clean) {
        cleanTotal++
        if (preds.length > 0) {
          cleanHit++
          cleanSpans += preds.length
        }
      }
      for (const g of row.gold) {
        byType[g.type] ??= { entities: 0, masked: 0 }
        byType[g.type].entities++
        if (preds.some((p) => overlap(g, p))) byType[g.type].masked++
      }
    }

    for (const stat of Object.values(byType)) {
      stat.maskedRecallPct = stat.entities
        ? Number(((100 * stat.masked) / stat.entities).toFixed(1))
        : 0
    }

    results[cname][sys] = {
      texts: rows.length,
      byType,
      clean: cleanTotal
        ? {
            sentences: cleanTotal,
            withDetection: cleanHit,
            pct: Number(((100 * cleanHit) / cleanTotal).toFixed(1)),
            spans: cleanSpans,
          }
        : null,
    }
  }
}

const summary = {}
for (const sys of systems) {
  const pool = (corpusList, type) => {
    let m = 0
    let t = 0
    for (const c of corpusList) {
      const s = results[c]?.[sys]?.byType?.[type]
      if (s) {
        m += s.masked
        t += s.entities
      }
    }
    return { masked: m, total: t, pct: t ? Number(((100 * m) / t).toFixed(1)) : null }
  }
  const poolClean = (corpusList) => {
    let h = 0
    let t = 0
    for (const c of corpusList) {
      const cl = results[c]?.[sys]?.clean
      if (cl) {
        h += cl.withDetection
        t += cl.sentences
      }
    }
    return { withDetection: h, total: t, pct: t ? Number(((100 * h) / t).toFixed(1)) : null }
  }

  const casedNer = ["uner-sv-talbanken-cased", "uner-sv-pud-cased", "wikiann-sv", "swener-1800"]
  const lowerNer = ["uner-sv-talbanken-lower", "uner-sv-pud-lower"]
  summary[sys] = {
    perCased: pool(casedNer, "PER"),
    perLower: pool(lowerNer, "PER"),
    locCased: pool(casedNer, "LOC"),
    orgCased: pool(casedNer, "ORG"),
    overMaskProse: poolClean(["uner-sv-talbanken-cased", "uner-sv-pud-cased"]),
    overMaskMedical1177: poolClean(["swedish-medical-1177"]),
  }
}

writeFileSync(outPath, `${JSON.stringify({ summary, results }, null, 2)}\n`)
console.log(`Saved sealed holdout score -> ${outPath}`)
console.log("\n=== SEALED HOLDOUT SUMMARY (UNTOUCHED EXTERNAL CORPORA) ===")
for (const [sys, s] of Object.entries(summary)) {
  console.log(
    `${sys.padEnd(24)} | PER=${String(s.perCased.pct).padStart(5)}% | PER-low=${String(s.perLower.pct).padStart(5)}% | LOC=${String(s.locCased.pct).padStart(5)}% | ORG=${String(s.orgCased.pct).padStart(5)}% | CleanProseFP=${String(s.overMaskProse.pct).padStart(5)}% | Med1177FP=${String(s.overMaskMedical1177.pct).padStart(5)}%`,
  )
}
