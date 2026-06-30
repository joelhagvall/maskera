import type { Redaction } from "@maska/core"
import type { ReactNode } from "react"

interface Range {
  start: number
  end: number
  key: string
}

/**
 * Interleave plain text with rendered spans for the given (sorted, non-
 * overlapping) ranges. One implementation, used by both the highlighted input
 * and the redacted output.
 */
function weave(
  text: string,
  ranges: Range[],
  render: (slice: string, key: string) => ReactNode,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const r of ranges) {
    if (r.start > last) nodes.push(text.slice(last, r.start))
    nodes.push(render(text.slice(r.start, r.end), r.key))
    last = r.end
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Original text with detected PII marked. */
export function HighlightedText({ text, redactions }: { text: string; redactions: Redaction[] }) {
  const ranges = redactions.map((r) => ({
    start: r.start,
    end: r.end,
    key: `${r.start}-${r.label}`,
  }))
  return (
    <>
      {weave(text, ranges, (slice, key) => (
        <mark key={key} className="hl">
          {slice}
        </mark>
      ))}
      {"\n"}
    </>
  )
}

const TOKEN_RE = /\[[A-ZÅÄÖ_]+_\d+\]/g

/** Redacted text with placeholder tokens styled. */
export function RedactedText({ text }: { text: string }) {
  const ranges: Range[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    ranges.push({ start: m.index, end: m.index + m[0].length, key: `${m.index}-${m[0]}` })
  }
  return (
    <>
      {weave(text, ranges, (slice, key) => (
        <span key={key} className="token">
          {slice}
        </span>
      ))}
    </>
  )
}
