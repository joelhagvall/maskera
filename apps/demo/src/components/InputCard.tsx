import type { Redaction } from "@maskera/core"
import { PencilIcon } from "../icons"
import { HighlightedText } from "../segments"
import { OverlayEditor } from "./OverlayEditor"

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
      <OverlayEditor
        value={text}
        onChange={onChange}
        name="source-text"
        ariaLabel="Din text"
        placeholder={`Skriv eller klistra in egen text här… Allt körs lokalt.${tagline ? `\n\nExempel: ${tagline}` : ""}`}
        highlight={<HighlightedText text={text} redactions={redactions} />}
      />
    </section>
  )
}
