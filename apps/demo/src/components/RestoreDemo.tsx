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
 * Per-scenario AI replies, each written in its own domain (screening, support,
 * journal, litigation, casework) so the answer card follows the scenario the
 * visitor picked. Every reply is built from the live map's placeholders, so it
 * restores end to end and gracefully drops a clause when a token is absent.
 */
const REPLIES: Record<string, (map: Record<string, string>) => string> = {
  hr: (map) => {
    const namn = pickToken(map, "NAMN")
    const email = pickToken(map, "EPOST")
    const who = namn ? ` för ${namn}` : ""
    const back = namn
      ? `Boka en första intervju och återkoppla till ${namn}${email ? ` på ${email}` : ""}.`
      : "Boka en första intervju och dokumentera bedömningen."
    return `Tack! Jag har gått igenom CV:t${who} mot rollbeskrivningen och profilen ser stark ut. Förslag på intervjufrågor finns nedan. ${back}`
  },
  support: (map) => {
    const namn = pickToken(map, "NAMN")
    const card = pickToken(map, "KORTNUMMER")
    const contact = pickToken(map, "TELEFON", "EPOST")
    const who = namn ? ` för ${namn}` : ""
    const sparr = card ? ` och spärrat kortet ${card}` : ""
    const back = contact
      ? `Nästa steg: beställ nytt kort och återkoppla${namn ? ` till ${namn}` : ""} på ${contact}.`
      : "Nästa steg: beställ nytt kort och dokumentera ärendet."
    return `Tack för underlaget! Jag har skapat ärendet${who}${sparr}. ${back}`
  },
  vard: (map) => {
    const namn = pickToken(map, "NAMN")
    const email = pickToken(map, "EPOST")
    const phone = pickToken(map, "TELEFON")
    const who = namn ? ` för ${namn}` : ""
    const mail = email ? ` Sammanfattningen skickas till ${email}.` : ""
    const anhorig = phone ? ` Nå anhörig på ${phone} om läget förändras.` : ""
    return `Journalanteckningen${who} är uppdaterad med EKG-svaret.${mail}${anhorig}`
  },
  juridik: (map) => {
    const namn = pickToken(map, "NAMN")
    const konto = pickToken(map, "BANKGIRO", "IBAN", "PLUSGIRO")
    const who = namn ? ` för ${namn}` : ""
    const pay = konto ? ` Bekräfta att betalning ska ske till ${konto}.` : ""
    return `Jag har sammanställt ärendet${who} inför förhandlingen och yrkandet om skadestånd är dokumenterat.${pay} Återkoppla inför mötet.`
  },
  kommun: (map) => {
    const namn = pickToken(map, "NAMN")
    const email = pickToken(map, "EPOST")
    const who = namn ? ` för ${namn}` : ""
    const back = namn && email ? ` Återkoppla beslutet till ${namn} på ${email}.` : ""
    return `Ärendet${who} är sammanställt för handläggaren och underlaget om försörjningsstöd är komplett.${back}`
  },
}

/**
 * A believable AI reply for the current redaction, written with the very
 * placeholders the model would have received. Restoring it demonstrates the
 * round trip end to end without asking the visitor to actually call an AI.
 * Derived from the live map, so it gains the person's name the moment the
 * model layer adds it. When a scenario id is given, its domain-specific reply
 * is used; otherwise (e.g. "Egen text") a generic case-handling reply.
 */
export function sampleAiReply(map: Record<string, string>, scenarioId?: string): string {
  const builder = scenarioId ? REPLIES[scenarioId] : undefined
  if (builder) return builder(map)
  const namn = pickToken(map, "NAMN")
  const contact = pickToken(map, "TELEFON", "EPOST")
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
 *
 * The expanded/collapsed state is owned by the parent: this component is
 * keyed per scenario (to reset the edited draft), so local open state would
 * collapse the flow on every scenario switch.
 */
export function RestoreDemo({
  result,
  scenarioId,
  open,
  onToggleOpen,
}: {
  result: RedactResult
  scenarioId?: string
  open: boolean
  onToggleOpen: () => void
}) {
  const { map } = result
  const auto = useMemo(() => sampleAiReply(map, scenarioId), [map, scenarioId])
  // null = untouched (mirror the generated sample); a string = the visitor's edit.
  const [draft, setDraft] = useState<string | null>(null)
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
          aria-controls="restore-flow-details"
          onClick={onToggleOpen}
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
      {open ? (
        <div className="grid restore-grid" id="restore-flow-details">
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
                name="ai-response"
                autoComplete="off"
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
      ) : (
        <div id="restore-flow-details" hidden />
      )}
    </section>
  )
}
