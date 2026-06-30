import type { Redaction } from "@maska/core"
import type { ReactNode } from "react"
import { labelMeta } from "./labels"

interface Range {
  start: number
  end: number
  key: string
  color: string
}

/**
 * Interleave plain text with rendered spans for the given (sorted, non-
 * overlapping) ranges. One implementation, used by both the highlighted input
 * and the redacted output.
 */
function weave(
  text: string,
  ranges: Range[],
  render: (slice: string, range: Range) => ReactNode,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const r of ranges) {
    if (r.start > last) nodes.push(text.slice(last, r.start))
    nodes.push(render(text.slice(r.start, r.end), r))
    last = r.end
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Original text with detected PII marked, colour-coded by category. */
export function HighlightedText({ text, redactions }: { text: string; redactions: Redaction[] }) {
  const ranges: Range[] = redactions.map((r) => ({
    start: r.start,
    end: r.end,
    key: `${r.start}-${r.label}`,
    color: labelMeta(r.label).color,
  }))
  return (
    <>
      {weave(text, ranges, (slice, r) => (
        <mark
          key={r.key}
          className="hl"
          style={{ background: `${r.color}14`, boxShadow: `inset 0 -1.6px 0 ${r.color}` }}
        >
          {slice}
        </mark>
      ))}
      {"\n"}
    </>
  )
}

const TOKEN_RE = /\[([A-ZÅÄÖ_]+)_\d+\]/g

/** Redacted text with placeholder tokens styled per category. */
export function RedactedText({ text }: { text: string }) {
  const ranges: Range[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      key: `${m.index}-${m[0]}`,
      color: labelMeta(m[1]).color,
    })
  }
  return (
    <>
      {weave(text, ranges, (slice, r) => (
        <span key={r.key} className="token" style={{ color: r.color, borderColor: `${r.color}55` }}>
          {slice}
        </span>
      ))}
    </>
  )
}
