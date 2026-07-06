import type { RedactResult } from "@maskera/core"
import { Fragment, useMemo, useRef, useState } from "react"
import { ChatIcon, CheckIcon, KeyIcon } from "../icons"
import { RestoredText, TokenHighlight } from "../segments"

const FLOW = ["Din text", "AI ser", "AI svarar", "Du ser"]

/** First placeholder token in `map` matching any of the given label prefixes. */
function pickToken(map: Record<string, string>, ...labels: string[]): string | null {
  const keys = Object.keys(map)
  for (const label of labels) {
    const token = keys.find((k) => k.startsWith(`[${label}_`))
    if (token) return token
  }
  return null
}

/**
 * A believable AI reply for the current redaction, written with the very
 * placeholders the model would have received. Restoring it demonstrates the
 * round trip end to end without asking the visitor to actually call an AI.
 * Derived from the live map, so it gains the person's name the moment the
 * model layer adds it.
 */
export function sampleAiReply(map: Record<string, string>): string {
  const namn = pickToken(map, "NAMN", "PER", "PERSON")
  const contact = pickToken(map, "PHONE", "EMAIL")
  const who = namn ? ` för ${namn}` : ""
  const first = `Tack för underlaget! Jag har sammanställt ärendet${who} och föreslår nästa steg nedan.`
  const second = contact
    ? `Återkoppla${namn ? ` till ${namn}` : ""} på ${contact} och dokumentera bedömningen i systemet.`
    : "Dokumentera bedömningen i systemet och boka en uppföljning."
  return `${first} ${second}`
}

/**
 * Step three of the demo: the AI answers with the placeholders still in place,
 * and maskera swaps the originals back in locally, using the key that never
 * left the device. Only rendered when there is something to restore.
 */
export function RestoreDemo({ result }: { result: RedactResult }) {
  const { map } = result
  const auto = useMemo(() => sampleAiReply(map), [map])
  // null = untouched (mirror the generated sample); a string = the visitor's edit.
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const reply = draft ?? auto

  return (
    <section className="restore">
      <div className="restore-head">
        <div className="restore-intro">
          <h2 className="restore-title">Så fungerar återställningen</h2>
          <p className="restore-note">
            AI:n arbetar bara med platshållare. När svaret kommer tillbaka återställer maskera dina
            riktiga uppgifter lokalt. Återställningsnyckeln lämnar aldrig din enhet.
          </p>
        </div>
        <button
          type="button"
          className="link restore-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Dölj flödet" : "Se hela flödet"}
        </button>
      </div>
      <div className="flow">
        {FLOW.map((step, i) => (
          <Fragment key={step}>
            {i > 0 && (
              <span className="flow-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="flow-step">
              {i === FLOW.length - 1 && <CheckIcon size={12} />}
              {step}
            </span>
          </Fragment>
        ))}
      </div>
      {open && (
        <div className="grid restore-grid">
          <section className="card">
            <div className="card-head">
              <span className="card-title">
                <ChatIcon size={14} />
                AI:ns svar
              </span>
              {draft !== null && (
                <button type="button" className="clear" onClick={() => setDraft(null)}>
                  Återställ exempel
                </button>
              )}
            </div>
            <div className="editor reply-editor">
              <div className="backdrop" ref={backdropRef} aria-hidden>
                <TokenHighlight text={reply} />
              </div>
              <textarea
                value={reply}
                aria-label="AI:ns svar med platshållare"
                spellCheck={false}
                onChange={(e) => setDraft(e.target.value)}
                onScroll={(e) => {
                  if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
                }}
              />
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <span className="card-title">
                <KeyIcon size={14} />
                Med dina uppgifter tillbaka
              </span>
            </div>
            <div className="output restored">
              <RestoredText text={reply} map={map} />
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
