#!/usr/bin/env node
/**
 * Score every system's detections on the independent corpora with one rule
 * set, so all systems are measured the same way.
 *
 * Inputs: corpora from build_corpora.py (tmp/indep/corpora/<corpus>.jsonl)
 * and detections from the runners (tmp/indep/preds/<system>/<corpus>.jsonl).
 *
 * Metrics, per corpus and gold type (PER, LOC, ORG, ADDRESS, ...):
 *   - typed: one-to-one overlap matching between gold spans and detections of
 *     the same mapped type -> tp / fp / fn, precision, recall, F1. Same rule
 *     as training/benchmark_suc3_external_v20.py, so its published SUC cells
 *     reproduce.
 *   - maskedRecall: share of gold spans overlapped by any detection of any
 *     label. This is what a masking product is judged on: was the value
 *     hidden at all, whatever it was called.
 *   - clean: on sentences with no gold entity of any kind, the share with at
 *     least one detection (over-masking).
 *
 * Usage: node bench/independent/score.mjs [--systems a,b] [--out file.json]
 */

import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))

/** Each system's own labels mapped to the shared gold types. */
export const TYPE_OF = {
  maskera: {
    NAMN: "PER",
    PLATS: "LOC",
    ADRESS: "ADDRESS",
    POSTNUMMER: "ZIPCODE",
    LAGENHETSNUMMER: "ADDRESS",
    ORGANISATION: "ORG",
    EPOST: "EMAIL",
    TELEFON: "PHONE",
    PERSONNUMMER: "PERSONNUMMER",
    SAMORDNINGSNUMMER: "PERSONNUMMER",
    KORTNUMMER: "CARD",
  },
  presidio: {
    PERSON: "PER",
    LOCATION: "LOC",
    ORGANIZATION: "ORG",
    EMAIL_ADDRESS: "EMAIL",
    PHONE_NUMBER: "PHONE",
    SE_PERSONNUMMER: "PERSONNUMMER",
    CREDIT_CARD: "CARD",
  },
  "openai-privacy-filter": {
    private_person: "PER",
    private_address: "ADDRESS",
    private_email: "EMAIL",
    private_phone: "PHONE",
    account_number: "CARD",
  },
  "swedish-pii": {
    PER_FIRST: "PER",
    PER_LAST: "PER",
    SE_STREET_ADDRESS: "ADDRESS",
    SE_POSTAL_CODE: "ZIPCODE",
    SE_CITY: "LOC",
    EMAIL_ADDRESS: "EMAIL",
    PHONE_NUMBER: "PHONE",
  },
}

/** Gold types that also accept a detection mapped to another type. */
const ALSO_ACCEPTS = {
  LOC: ["ADDRESS"],
  ADDRESS: ["LOC", "ZIPCODE"],
  ZIPCODE: ["ADDRESS"],
}

const overlaps = (a, b) => Math.max(a.start, b.start) < Math.min(a.end, b.end)

export function typeOf(system, label) {
  const table = TYPE_OF[system] ?? {}
  if (table[label]) return table[label]
  if (system === "swedish-pii" && /^SE_(PERSONAL_IDENTITY|COORDINATION)_NUMBER/.test(label)) {
    return "PERSONNUMMER"
  }
  if (system === "swedish-pii" && /_CREDIT_CARD$/.test(label)) return "CARD"
  return null
}

/**
 * Join a system's detections of the same mapped type that touch or are
 * separated only by spaces (swedish-pii splits "Anna Andersson" into a first
 * and a last name). Applied to every system alike, so one name is one
 * detection whoever found it.
 */
export function mergeAdjacent(system, text, preds) {
  const sorted = [...preds].sort((a, b) => a.start - b.start)
  const out = []
  for (const p of sorted) {
    const last = out[out.length - 1]
    const type = typeOf(system, p.label)
    if (
      last &&
      type &&
      typeOf(system, last.label) === type &&
      p.start >= last.end &&
      text.slice(last.end, p.start).trim() === ""
    ) {
      last.end = Math.max(last.end, p.end)
    } else {
      out.push({ ...p })
    }
  }
  return out
}

/** Gold types marked with * have unreliable values; they score like the plain type. */
const baseType = (type) => type.replace(/\*$/, "")

function prf(tp, fp, fn) {
  const p = tp + fp ? tp / (tp + fp) : 0
  const r = tp + fn ? tp / (tp + fn) : 0
  const f = p + r ? (2 * p * r) / (p + r) : 0
  const pct = (x) => Math.round(x * 1000) / 10
  return { tp, fp, fn, precisionPct: pct(p), recallPct: pct(r), f1Pct: pct(f) }
}

/**
 * Score one system on one corpus. `rows` and `preds` are aligned by id.
 * `countCleanFp` adds typed detections in clean sentences to fp, as the
 * published cased SUC cell does.
 */
export function scoreCorpus(system, rows, predsById, { countCleanFp = true } = {}) {
  const types = [...new Set(rows.flatMap((row) => row.gold.map((g) => g.type)))].sort()
  const typed = Object.fromEntries(
    types.map((t) => [t, { tp: 0, fp: 0, fn: 0, masked: 0, total: 0 }]),
  )
  let cleanTotal = 0
  let cleanAny = 0
  let cleanSpans = 0
  for (const row of rows) {
    const preds = mergeAdjacent(system, row.text, predsById.get(row.id) ?? [])
    if (row.gold.length === 0 && row.clean !== false) {
      cleanTotal += 1
      if (preds.length) {
        cleanAny += 1
        cleanSpans += preds.length
      }
      if (countCleanFp) {
        for (const t of types) {
          typed[t].fp += preds.filter((p) => typeOf(system, p.label) === baseType(t)).length
        }
      }
      continue
    }
    if (row.gold.length === 0) continue
    for (const t of types) {
      const base = baseType(t)
      const accepts = new Set([base, ...(ALSO_ACCEPTS[base] ?? [])])
      const typedPreds = preds.filter((p) => accepts.has(typeOf(system, p.label)))
      const own = preds.filter((p) => typeOf(system, p.label) === base)
      const matched = new Set()
      for (const g of row.gold.filter((x) => x.type === t)) {
        typed[t].total += 1
        if (preds.some((p) => overlaps(g, p))) typed[t].masked += 1
        const index = typedPreds.findIndex((p, i) => !matched.has(i) && overlaps(g, p))
        if (index >= 0) {
          typed[t].tp += 1
          matched.add(index)
        } else {
          typed[t].fn += 1
        }
      }
      // Unmatched detections of exactly this type count against precision.
      const matchedOwn = [...matched].filter((i) => own.includes(typedPreds[i])).length
      typed[t].fp += own.length - matchedOwn
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
  return {
    texts: rows.length,
    byType: Object.fromEntries(
      types.map((t) => [
        t,
        {
          entities: typed[t].total,
          masked: typed[t].masked,
          ...prf(typed[t].tp, typed[t].fp, typed[t].fn),
          maskedRecallPct: pct(typed[t].masked, typed[t].total),
        },
      ]),
    ),
    clean: cleanTotal
      ? {
          sentences: cleanTotal,
          withDetection: cleanAny,
          withDetectionPct: pct(cleanAny, cleanTotal),
          spans: cleanSpans,
        }
      : null,
  }
}

/**
 * The headline cells: masked share pooled over distinct texts, so each
 * independent sentence counts once. Lowercase SUC is the same sentences as
 * cased SUC and only enters the lowercase cell.
 */
export const SUMMARY = {
  names: {
    corpora: ["suc3-test-cased", "multiconer-sv", "ai4privacy-sv", "sic2-sv"],
    types: ["PER"],
  },
  namesLowercase: { corpora: ["suc3-test-lower", "multiconer-sv"], types: ["PER"] },
  places: { corpora: ["suc3-test-cased", "ai4privacy-sv", "sic2-sv"], types: ["LOC"] },
  addresses: { corpora: ["ai4privacy-sv"], types: ["ADDRESS", "ZIPCODE"] },
}

export const OVER_MASKING_CORPORA = ["suc3-test-cased", "sic2-sv"]

export function summarize(results) {
  const systems = [...new Set(Object.values(results).flatMap((bySystem) => Object.keys(bySystem)))]
  const summary = {}
  for (const system of systems) {
    summary[system] = {}
    for (const [cell, { corpora, types }] of Object.entries(SUMMARY)) {
      let masked = 0
      let total = 0
      for (const corpus of corpora) {
        const byType = results[corpus]?.[system]?.byType
        if (!byType) {
          total = Number.NaN
          break
        }
        for (const t of types) {
          masked += byType[t]?.masked ?? 0
          total += byType[t]?.entities ?? 0
        }
      }
      summary[system][cell] = Number.isFinite(total)
        ? { masked, total, maskedPct: total ? Math.round((masked / total) * 1000) / 10 : null }
        : null
    }
    let cleanSentences = 0
    let cleanWithDetection = 0
    let cleanOk = true
    for (const corpus of OVER_MASKING_CORPORA) {
      const clean = results[corpus]?.[system]?.clean
      if (!clean) {
        cleanOk = false
        break
      }
      cleanSentences += clean.sentences
      cleanWithDetection += clean.withDetection
    }
    summary[system].overMasking =
      cleanOk && cleanSentences
        ? {
            sentences: cleanSentences,
            withDetection: cleanWithDetection,
            pct: Math.round((cleanWithDetection / cleanSentences) * 1000) / 10,
          }
        : null
  }
  return summary
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function main() {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => {
    const index = args.indexOf(name)
    return index >= 0 ? args[index + 1] : fallback
  }
  const corporaDir = resolve(repoRoot, flag("--corpora", "tmp/indep/corpora"))
  const predsDir = resolve(repoRoot, flag("--preds", "tmp/indep/preds"))
  const only = flag("--only", "")
  const systems = readdirSync(predsDir).filter((name) => !name.startsWith("."))
  const results = {}
  const corpora = {}
  for (const file of readdirSync(corporaDir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()) {
    const corpus = basename(file, ".jsonl")
    if (only && !corpus.startsWith(only)) continue
    const raw = readFileSync(resolve(corporaDir, file))
    const rows = readJsonl(resolve(corporaDir, file))
    corpora[corpus] = {
      texts: rows.length,
      goldSpans: rows.reduce((n, row) => n + row.gold.length, 0),
      cleanSentences: rows.filter((row) => row.gold.length === 0 && row.clean !== false).length,
      sha256: createHash("sha256").update(raw).digest("hex"),
    }
    results[corpus] = {}
    for (const system of systems) {
      const path = resolve(predsDir, system, file)
      if (!existsSync(path)) continue
      const preds = new Map(readJsonl(path).map((r) => [r.id, r.preds]))
      results[corpus][system] = scoreCorpus(system, rows, preds)
    }
  }
  const out = flag("--out", "")
  const json = `${JSON.stringify({ corpora, summary: summarize(results), results }, null, 2)}\n`
  if (out) writeFileSync(resolve(repoRoot, out), json)
  else process.stdout.write(json)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
