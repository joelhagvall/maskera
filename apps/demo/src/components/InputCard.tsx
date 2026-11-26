import type { Redaction } from "@maskera/core"
import copy from "../i18n"
import { HighlightedText } from "../segments"
import { OverlayEditor } from "./OverlayEditor"
import { TryStep } from "./TryStep"

/** Step 1 of the home demo: the visitor's own text, editable, with hits highlighted. */
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
    <TryStep
      n={1}
      label={copy.inputCard.title}
      action={
        text ? (
          <button type="button" className="clear" onClick={() => onChange("")}>
            {copy.inputCard.clear}
          </button>
        ) : null
      }
    >
      <OverlayEditor
        value={text}
        onChange={onChange}
        name="source-text"
        ariaLabel={copy.inputCard.title}
        placeholder={`${copy.inputCard.placeholder}${tagline ? `\n\n${copy.inputCard.examplePrefix} ${tagline}` : ""}`}
        highlight={<HighlightedText text={text} redactions={redactions} />}
      />
    </TryStep>
  )
}
