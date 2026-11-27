/**
 * Shared budget parsing and enforcement for opt-in `--live` cloud model tests.
 */

export const DEFAULT_LIVE_MAX_USD = 0.25

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
