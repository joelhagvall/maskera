import { type ReactNode, useRef, useState } from "react"
import { MAX_INPUT_CHARS } from "../constants"
import copy from "../i18n"

/**
 * A textarea with a highlight layer behind it: the backdrop renders the
 * highlighted mirror of the text and scroll-syncs with the transparent-text
 * textarea in front. The highlight node must add no width to the text (see
 * segments.tsx), or the layers drift out of alignment.
 *
 * Input size is bounded: masking runs a main-thread regex pass plus worker
 * clones per keystroke, so an unbounded paste can freeze the tab. The cap is
 * enforced manually instead of via maxLength because the attribute clips a
 * longer paste silently - and in a masking tool, silent clipping means the
 * visitor believes the dropped tail was masked too. Enforcing here lets us
 * say what happened.
 */
export function OverlayEditor({
  value,
  onChange,
  name,
  ariaLabel,
  placeholder,
  className = "editor",
  language,
  highlight,
}: {
  value: string
  onChange: (next: string) => void
  name: string
  ariaLabel: string
  placeholder?: string
  className?: string
  language?: string
  highlight: ReactNode
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [truncated, setTruncated] = useState(false)

  const handleChange = (next: string) => {
    if (next.length > MAX_INPUT_CHARS) {
      onChange(next.slice(0, MAX_INPUT_CHARS))
      setTruncated(true)
    } else {
      onChange(next)
      setTruncated(false)
    }
  }

  return (
    <>
      <div className={className} lang={language} translate="no">
        <div className="backdrop" ref={backdropRef} aria-hidden>
          {highlight}
        </div>
        <textarea
          name={name}
          autoComplete="off"
          value={value}
          aria-label={ariaLabel}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
          }}
        />
      </div>
      {truncated ? (
        <p className="editor-limit" role="status">
          {copy.inputCard.limitNote}
        </p>
      ) : null}
    </>
  )
}
