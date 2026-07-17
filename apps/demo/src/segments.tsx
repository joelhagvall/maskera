import type { Redaction } from "@maskera/core"
import type { ReactNode } from "react"
import { hlStyle, labelMeta, pillStyle } from "./labels"

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

const TOKEN_RE = /\[([A-ZÅÄÖ_]+)_\d+\]/g

/** One range per placeholder token in the text, coloured by its category. */
function tokenRanges(text: string): Range[] {
  const ranges: Range[] = []
  for (const m of text.matchAll(TOKEN_RE)) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      key: `${m.index}-${m[0]}`,
      color: labelMeta(m[1]).color,
    })
  }
  return ranges
}

/**
 * Text with the given ranges underline-marked. The trailing newline keeps the
 * backdrop's height in sync with the textarea when the text ends in newlines.
 */
function MarkedText({ text, ranges }: { text: string; ranges: Range[] }) {
  return (
    <>
      {weave(text, ranges, (slice, r) => (
        <mark key={r.key} className="hl" style={hlStyle(r.color)}>
          {slice}
        </mark>
      ))}
      {"\n"}
    </>
  )
}

/** Original text with detected PII marked, colour-coded by category. */
export function HighlightedText({ text, redactions }: { text: string; redactions: Redaction[] }) {
  const ranges: Range[] = redactions.map((r) => ({
    start: r.start,
    end: r.end,
    key: `${r.start}-${r.label}`,
    color: labelMeta(r.label).color,
  }))
  return <MarkedText text={text} ranges={ranges} />
}

/**
 * Placeholder tokens marked per category with the same underline style as the
 * input highlights. Unlike RedactedText's pills, this adds no width, so it can
 * sit in a backdrop overlay behind a transparent textarea and stay aligned.
 */
export function TokenHighlight({ text }: { text: string }) {
  return <MarkedText text={text} ranges={tokenRanges(text)} />
}

/** Redacted text with placeholder tokens styled per category. */
export function RedactedText({ text }: { text: string }) {
  return (
    <>
      {weave(text, tokenRanges(text), (slice, r) => (
        <span key={r.key} className="token" style={pillStyle(r.color)}>
          {slice}
        </span>
      ))}
    </>
  )
}

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
    nodes.push(
      <mark key={`${start}-${token}-${i++}`} className="hl" style={hlStyle(labelMeta(m[1]).color)}>
        {value}
      </mark>,
    )
    last = start + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}
