// The independent Swedish benchmark, read straight from the result file the
// bench scripts write (bench/independent/score.mjs), so no number on the site
// is typed by hand. docs/benchmark-release.json pins that file's checksum.

import bench from "../../../docs/benchmark-independent-v20.json"
import release from "../../../docs/benchmark-release.json"
import products from "../../../docs/benchmark-swedish-products-v20.json"
import { activeLocale } from "./i18n"

export const SYSTEMS = ["maskera", "presidio", "swedish-pii", "openai-privacy-filter"] as const
export type SystemId = (typeof SYSTEMS)[number]

/** The share-hidden cells, in the order the page shows them. */
export const COVERAGE_CELLS = ["names", "namesLowercase", "places", "addresses"] as const
export type CoverageCell = (typeof COVERAGE_CELLS)[number]

export interface Coverage {
  masked: number
  total: number
  maskedPct: number
}
export interface OverMasking {
  sentences: number
  withDetection: number
  pct: number
}
export type SystemSummary = Record<CoverageCell, Coverage | null> & {
  overMasking: OverMasking | null
}

export const summary = bench.summary as unknown as Record<SystemId, SystemSummary>

/** Download size per system: Maskera from the pinned artifact, the rest as measured. */
const PRODUCT_IDS: Record<Exclude<SystemId, "maskera">, string> = {
  presidio: "microsoft-presidio-sv",
  "swedish-pii": "swedish-pii",
  "openai-privacy-filter": "openai-privacy-filter",
}
export function sizeMb(system: SystemId): number {
  if (system === "maskera") return release.artifact.bytes / 1e6
  const row = products.systems.find((s) => s.id === PRODUCT_IDS[system])
  if (!row?.sizeMb) throw new Error(`no measured size for ${system}`)
  return row.sizeMb
}

export function formatPct(pct: number): string {
  const fixed = pct.toFixed(1)
  return activeLocale === "sv" ? `${fixed.replace(".", ",")} %` : `${fixed}%`
}

export function formatCount(n: number): string {
  return n.toLocaleString(activeLocale === "sv" ? "sv-SE" : "en-GB")
}

export function formatMb(mb: number): string {
  return `${Math.round(mb)} MB`
}
