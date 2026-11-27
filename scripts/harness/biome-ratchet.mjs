#!/usr/bin/env node
/**
 * Biome lint ratchet guard (agent-ready-code ratchet pattern).
 *
 * Legacy violations live in `scripts/harness/biome-ratchet-baseline.json` so
 * `biome.json` can enforce `recommended` + `noExplicitAny: error` on every
 * other file right away. This guard runs Biome WITHOUT those legacy overrides
 * on the baselined files and fails on both growth (actual > baseline) and
 * slack (actual < baseline).
 *
 * Usage:
 *   node scripts/harness/biome-ratchet.mjs           # verify no growth or slack
 *   node scripts/harness/biome-ratchet.mjs --update  # lower baseline only (never raises)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const BASELINE_PATH = join(ROOT, "scripts", "harness", "biome-ratchet-baseline.json")

/** Compare actual per-file per-rule error counts against the frozen baseline. */
export function evaluateRatchet(baseline, actual) {
  const growth = []
  const slack = []
  const files = new Set([...Object.keys(baseline), ...Object.keys(actual)])
  for (const file of [...files].sort()) {
    const baseRules = baseline[file] ?? {}
    const actRules = actual[file] ?? {}
    const rules = new Set([...Object.keys(baseRules), ...Object.keys(actRules)])
    for (const rule of [...rules].sort()) {
      const b = baseRules[rule] ?? 0
      const a = actRules[rule] ?? 0
      if (a > b) growth.push({ file, rule, baseline: b, actual: a })
      else if (a < b) slack.push({ file, rule, baseline: b, actual: a })
    }
  }
  return { ok: growth.length === 0 && slack.length === 0, growth, slack }
}

/** Produce a lowered baseline (never raises any count; drops zeroed rules/files). */
export function lowerBaseline(baseline, actual) {
  const next = {}
  for (const file of Object.keys(baseline).sort()) {
    const baseRules = baseline[file] ?? {}
    const actRules = actual[file] ?? {}
    const nextRules = {}
    for (const rule of Object.keys(baseRules).sort()) {
      const lowered = Math.min(baseRules[rule], actRules[rule] ?? 0)
      if (lowered > 0) nextRules[rule] = lowered
    }
    if (Object.keys(nextRules).length > 0) next[file] = nextRules
  }
  return next
}

function measureBaselineFiles(files) {
  const existing = files.filter((f) => existsSync(join(ROOT, f)))
  if (existing.length === 0) return {}
  const biomeCfg = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8"))
  const strictCfg = {
    $schema: biomeCfg.$schema,
    vcs: { enabled: false },
    linter: {
      ...biomeCfg.linter,
      domains: { react: "recommended" },
    },
  }
  const tmpDir = mkdtempSync(join(tmpdir(), "maskera-biome-ratchet-"))
  try {
    writeFileSync(join(tmpDir, "biome.json"), `${JSON.stringify(strictCfg, null, 2)}\n`)
    const biomeBin = join(ROOT, "node_modules", ".bin", "biome")
    let stdout = ""
    try {
      stdout = execFileSync(
        biomeBin,
        ["lint", "--config-path", tmpDir, "--reporter=json", "--max-diagnostics=500", ...existing],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      )
    } catch (err) {
      stdout = err.stdout ?? ""
      if (!stdout.trim().startsWith("{")) throw err
    }
    const parsed = JSON.parse(stdout)
    const counts = {}
    for (const diag of parsed.diagnostics ?? []) {
      if (diag.severity !== "error") continue
      const file = diag.location?.path
      const rule = diag.category
      if (!file || !rule) continue
      counts[file] ??= {}
      counts[file][rule] = (counts[file][rule] ?? 0) + 1
    }
    return counts
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const update = process.argv.includes("--update")
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
  const actual = measureBaselineFiles(Object.keys(baseline))
  const result = evaluateRatchet(baseline, actual)

  if (update) {
    if (result.growth.length > 0) {
      for (const g of result.growth) {
        console.error(
          `biome-ratchet: ${g.file} (${g.rule}) grew from ${g.baseline} to ${g.actual}; --update never raises the baseline.`,
        )
      }
      process.exit(1)
    }
    const lowered = lowerBaseline(baseline, actual)
    writeFileSync(BASELINE_PATH, `${JSON.stringify(lowered, null, 2)}\n`)
    console.log(
      "biome-ratchet: baseline lowered. Remove zeroed files from biome.json overrides too.",
    )
    process.exit(0)
  }

  if (!result.ok) {
    for (const g of result.growth) {
      console.error(
        `biome-ratchet: GROWTH in ${g.file} (${g.rule}): ${g.baseline} -> ${g.actual}. Fix the violation instead of adding debt.`,
      )
    }
    for (const s of result.slack) {
      console.error(
        `biome-ratchet: SLACK in ${s.file} (${s.rule}): baseline ${s.baseline}, actual ${s.actual}. Run \`pnpm run check:lint-ratchet -- --update\` to lock in the reduction.`,
      )
    }
    process.exit(1)
  }
}
