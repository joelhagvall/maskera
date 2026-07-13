// @vitest-environment jsdom
import type { Redaction } from "@maskera/core"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { labelMeta } from "../src/labels"
import { HighlightedText, RedactedText, RestoredText, TokenHighlight } from "../src/segments"

/**
 * The segment components interleave plain text with styled spans. The
 * invariant that matters is lossless text: whatever weaving happens, the
 * rendered textContent must reproduce the input (Highlighted/TokenHighlight
 * append a trailing newline for the textarea backdrop). The rest is which
 * slices end up inside spans/marks.
 */

const spanTexts = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll(selector)].map((el) => el.textContent)

describe("RedactedText", () => {
  it("wraps each token in a styled span and keeps surrounding text", () => {
    const text = "hej [NAMN_1], du bor på [ADRESS_1]."
    const { container } = render(<RedactedText text={text} />)
    expect(container.textContent).toBe(text)
    expect(spanTexts(container, "span.token")).toEqual(["[NAMN_1]", "[ADRESS_1]"])
  })

  it("token at start and end of text", () => {
    const text = "[NAMN_1] träffade [NAMN_2]"
    const { container } = render(<RedactedText text={text} />)
    expect(container.textContent).toBe(text)
    expect(spanTexts(container, "span.token")).toEqual(["[NAMN_1]", "[NAMN_2]"])
  })

  it("adjacent tokens with nothing between them", () => {
    const text = "[NAMN_1][TELEFON_1]"
    const { container } = render(<RedactedText text={text} />)
    expect(container.textContent).toBe(text)
    expect(spanTexts(container, "span.token")).toEqual(["[NAMN_1]", "[TELEFON_1]"])
  })

  it("åäö in label names is tokenized", () => {
    const text = "x [LÄGENHETSNUMMER_1] y"
    const { container } = render(<RedactedText text={text} />)
    expect(spanTexts(container, "span.token")).toEqual(["[LÄGENHETSNUMMER_1]"])
  })

  it("lowercase or malformed brackets are left as plain text", () => {
    const text = "inte [namn_1] och inte [NAMN1] heller"
    const { container } = render(<RedactedText text={text} />)
    expect(container.textContent).toBe(text)
    expect(container.querySelectorAll("span.token")).toHaveLength(0)
  })

  it("empty text renders nothing", () => {
    const { container } = render(<RedactedText text="" />)
    expect(container.textContent).toBe("")
  })
})

describe("HighlightedText", () => {
  const redaction = (text: string, value: string, label: string): Redaction => {
    const start = text.indexOf(value)
    return { label, value, start, end: start + value.length, replacement: `[${label}_1]` }
  }

  it("marks each redacted range and keeps the full text plus trailing newline", () => {
    const text = "Anna bor på Storgatan 12"
    const redactions = [redaction(text, "Anna", "NAMN"), redaction(text, "Storgatan 12", "ADRESS")]
    const { container } = render(<HighlightedText text={text} redactions={redactions} />)
    expect(container.textContent).toBe(`${text}\n`)
    expect(spanTexts(container, "mark.hl")).toEqual(["Anna", "Storgatan 12"])
  })

  it("no redactions renders the text unmarked", () => {
    const text = "ingen pii här"
    const { container } = render(<HighlightedText text={text} redactions={[]} />)
    expect(container.textContent).toBe(`${text}\n`)
    expect(container.querySelectorAll("mark")).toHaveLength(0)
  })

  it("colors the mark by label", () => {
    const text = "Anna ringde"
    const { container } = render(
      <HighlightedText text={text} redactions={[redaction(text, "Anna", "NAMN")]} />,
    )
    const mark = container.querySelector("mark.hl") as HTMLElement
    expect(mark.style.boxShadow).toContain(labelMeta("NAMN").color)
  })
})

describe("RestoredText", () => {
  it("swaps known tokens back to their original values", () => {
    const text = "Hej [NAMN_1], vi ses på [ADRESS_1]!"
    const map = { "[NAMN_1]": "Anna", "[ADRESS_1]": "Storgatan 12" }
    const { container } = render(<RestoredText text={text} map={map} />)
    expect(container.textContent).toBe("Hej Anna, vi ses på Storgatan 12!")
    expect(spanTexts(container, "mark.hl")).toEqual(["Anna", "Storgatan 12"])
  })

  it("unknown tokens are left as literal text", () => {
    const text = "kvar: [NAMN_1] och [OKÄND_9]"
    const { container } = render(<RestoredText text={text} map={{ "[NAMN_1]": "Anna" }} />)
    expect(container.textContent).toBe("kvar: Anna och [OKÄND_9]")
    expect(spanTexts(container, "mark.hl")).toEqual(["Anna"])
  })

  it("same token twice restores both occurrences", () => {
    const text = "[NAMN_1] pratade med [NAMN_1]"
    const { container } = render(<RestoredText text={text} map={{ "[NAMN_1]": "Anna" }} />)
    expect(container.textContent).toBe("Anna pratade med Anna")
    expect(spanTexts(container, "mark.hl")).toEqual(["Anna", "Anna"])
  })

  it("empty map leaves everything literal", () => {
    const text = "orört [NAMN_1] kvar"
    const { container } = render(<RestoredText text={text} map={{}} />)
    expect(container.textContent).toBe(text)
    expect(container.querySelectorAll("mark")).toHaveLength(0)
  })
})

describe("TokenHighlight", () => {
  it("underlines tokens without altering the text", () => {
    const text = "svar med [NAMN_1] kvar"
    const { container } = render(<TokenHighlight text={text} />)
    expect(container.textContent).toBe(`${text}\n`)
    expect(spanTexts(container, "mark.hl")).toEqual(["[NAMN_1]"])
  })
})
