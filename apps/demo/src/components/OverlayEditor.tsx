import { type ReactNode, useRef } from "react"

/**
 * A textarea with a highlight layer behind it: the backdrop renders the
 * highlighted mirror of the text and scroll-syncs with the transparent-text
 * textarea in front. The highlight node must add no width to the text (see
 * segments.tsx), or the layers drift out of alignment.
 */
export function OverlayEditor({
  value,
  onChange,
  name,
  ariaLabel,
  placeholder,
  className = "editor",
  highlight,
}: {
  value: string
  onChange: (next: string) => void
  name: string
  ariaLabel: string
  placeholder?: string
  className?: string
  highlight: ReactNode
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  return (
    <div className={className}>
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
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
        }}
      />
    </div>
  )
}
