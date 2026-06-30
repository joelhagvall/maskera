import type { Redaction } from "@maska/core"
import { useRef } from "react"
import { HighlightedText } from "../segments"

export function InputCard({
  tagline,
  text,
  redactions,
  onChange,
}: {
  tagline: string
  text: string
  redactions: Redaction[]
  onChange: (v: string) => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">Indata</span>
        <span className="card-sub">{tagline}</span>
      </div>
      <div className="editor">
        <div className="backdrop" ref={backdropRef} aria-hidden>
          <HighlightedText text={text} redactions={redactions} />
        </div>
        <textarea
          value={text}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
          }}
        />
      </div>
    </section>
  )
}
