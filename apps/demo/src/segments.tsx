import type { Redaction } from "@maskera/core"
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
          style={{ background: `${r.color}1f`, boxShadow: `inset 0 -2px 0 ${r.color}` }}
        >
          {slice}
        </mark>
      ))}
      {"\n"}
    </>
  )
}

const TOKEN_RE = /\[([A-ZÅÄÖ_]+)_\d+\]/g

/**
 * The reverse of RedactedText: text that still contains placeholder tokens,
 * rendered with each known token swapped back to its original value and marked
 * so the restored values stand out. Unknown tokens (no map entry) are left as
 * literal text. This is the "close the loop" view: what maskera hands back
 * after the AI has replied with the placeholders.
 */
export function RestoredText({ text, map }: { text: string; map: Record<string, string> }) {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    const token = m[0]
    const value = map[token]
    if (value == null) continue // not one of ours; leave it in the plain text
    const start = m.index
    if (start > last) nodes.push(text.slice(last, start))
    const color = labelMeta(m[1]).color
    nodes.push(
      <mark
        key={`${start}-${token}-${i++}`}
        className="hl"
        style={{ background: `${color}1f`, boxShadow: `inset 0 -2px 0 ${color}` }}
      >
        {value}
      </mark>,
    )
    last = start + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

/**
 * Placeholder tokens marked per category with the same underline style as the
 * input highlights. Unlike RedactedText's pills, this adds no width, so it can
 * sit in a backdrop overlay behind a transparent textarea and stay aligned.
 */
export function TokenHighlight({ text }: { text: string }) {
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
        <mark
          key={r.key}
          className="hl"
          style={{ background: `${r.color}1f`, boxShadow: `inset 0 -2px 0 ${r.color}` }}
        >
          {slice}
        </mark>
      ))}
      {"\n"}
    </>
  )
}

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
        <span
          key={r.key}
          className="token"
          style={{ color: r.color, background: `${r.color}12`, borderColor: `${r.color}59` }}
        >
          {slice}
        </span>
      ))}
    </>
  )
}
