import type { Redaction } from "@maskera/core"
import copy from "../i18n/sv.json"
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
          {copy.inputCard.title}
          {tagline && text ? <span className="card-sub">{tagline}</span> : null}
        </span>
        {text ? (
          <button type="button" className="clear" onClick={() => onChange("")}>
            {copy.inputCard.clear}
          </button>
        ) : null}
      </div>
      <OverlayEditor
        value={text}
        onChange={onChange}
        name="source-text"
        ariaLabel={copy.inputCard.title}
        placeholder={`${copy.inputCard.placeholder}${tagline ? `\n\n${copy.inputCard.examplePrefix} ${tagline}` : ""}`}
        highlight={<HighlightedText text={text} redactions={redactions} />}
      />
    </section>
  )
}
