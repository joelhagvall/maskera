import type { Redaction } from "@maskera/core"
import { useRef } from "react"
import { PencilIcon } from "../icons"
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
        <span className="card-title">
          <PencilIcon size={14} />
          Din text
          {tagline && text ? <span className="card-sub">{tagline}</span> : null}
        </span>
        {text ? (
          <button type="button" className="clear" onClick={() => onChange("")}>
            Rensa
          </button>
        ) : null}
      </div>
      <div className="editor">
        <div className="backdrop" ref={backdropRef} aria-hidden>
          <HighlightedText text={text} redactions={redactions} />
        </div>
        <textarea
          name="source-text"
          autoComplete="off"
          value={text}
          aria-label="Din text"
          spellCheck={false}
          placeholder={`Skriv eller klistra in egen text här… Allt körs lokalt.${tagline ? `\n\nExempel: ${tagline}` : ""}`}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
          }}
        />
      </div>
    </section>
  )
}
