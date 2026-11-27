/**
 * Shared CLI option and budget parsing for `@maskera/mcp` audit and live runs.
 * Kept free of `dist/` imports so `pnpm run check:tooling` works in a clean checkout.
 */

export const DEFAULT_LIVE_MAX_USD = 0.25

export const AUDIT_LANES = new Set([
  "quick",
  "privacy",
  "security",
  "e2e",
  "clients",
  "adversarial",
  "package",
  "offline",
  "benchmark",
  "full",
])

/** Parse a positive finite USD budget cap; undefined uses DEFAULT_LIVE_MAX_USD. */
export function parseMaxUsd(raw, defaultValue = DEFAULT_LIVE_MAX_USD) {
  if (raw === undefined || raw === null) return defaultValue
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new Error(`Invalid --max-usd "${raw}": expected a positive finite USD amount.`)
    }
    return raw
  }
  const trimmed = String(raw).trim()
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new Error(`Invalid --max-usd "${raw}": expected a positive finite USD amount.`)
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --max-usd "${raw}": expected a positive finite USD amount.`)
  }
  return value
}

/** Parse CLI arguments for `packages/mcp/audit/run-audit.mjs`. */
export function parseAuditCli(argv, { reportPath = "audit-results.json" } = {}) {
  let lane = "quick"
  let jsonOut = false
  let ciMode = false
  let live = false
  let maxUsd = DEFAULT_LIVE_MAX_USD
  let maxUsdExplicit = false
  let release = false
  let evidence = false
  let outPath = null
  let help = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    if (arg === "--json") jsonOut = true
    else if (arg === "--ci") ciMode = true
    else if (arg === "--live") live = true
    else if (arg === "--max-usd") {
      maxUsd = parseMaxUsd(argv[++i] ?? "")
      maxUsdExplicit = true
    } else if (arg.startsWith("--max-usd=")) {
      maxUsd = parseMaxUsd(arg.slice("--max-usd=".length))
      maxUsdExplicit = true
    } else if (arg === "--release") release = true
    else if (arg === "--evidence") evidence = true
    else if (arg === "--out") outPath = argv[++i] ?? null
    else if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length)
    else if (AUDIT_LANES.has(arg)) lane = arg
    else if (arg === "--help" || arg === "-h") help = true
    else throw new Error(`Unknown audit option or lane: ${arg}`)
  }
  if (help) {
    return { lane, jsonOut, ciMode, live, maxUsd, release, evidence, outPath, help: true }
  }
  if (maxUsdExplicit && !live) {
    throw new Error("--max-usd requires --live")
  }
  if (evidence) {
    if (outPath) throw new Error("--evidence always writes audit-results.json; drop --out")
    release = true
    outPath = reportPath
  }
  if (release && lane !== "full") {
    throw new Error(`--release gates a publish and needs the full lane, not ${lane}`)
  }
  return { lane, jsonOut, ciMode, live, maxUsd, release, evidence, outPath, help: false }
}

/** Extract `total_cost_usd` from `claude --output-format json` stdout when present. */
export function extractClaudeCostUsd(stdout) {
  if (typeof stdout !== "string" || !stdout.trim()) return null
  const trimmed = stdout.trim()
  const candidates = [trimmed, ...trimmed.split("\n").reverse()]
  for (const candidate of candidates) {
    const line = candidate.trim()
    if (!line.startsWith("{") || !line.endsWith("}")) continue
    try {
      const parsed = JSON.parse(line)
      if (typeof parsed?.total_cost_usd === "number" && Number.isFinite(parsed.total_cost_usd)) {
        return parsed.total_cost_usd
      }
    } catch {
      // keep scanning trailing lines
    }
  }
  return null
}

/** Throw when observed live spend exceeds the configured USD cap. */
export function assertWithinBudget({ spentUsd, maxUsd, label }) {
  if (typeof spentUsd !== "number" || !Number.isFinite(spentUsd)) return
  if (spentUsd > maxUsd) {
    throw new Error(
      `[${label}] live spend $${spentUsd.toFixed(4)} exceeded --max-usd cap $${maxUsd.toFixed(2)}.`,
    )
  }
}
