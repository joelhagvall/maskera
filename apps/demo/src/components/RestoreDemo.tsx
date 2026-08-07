import type { RedactResult } from "@maskera/core"
import { useMemo, useState } from "react"
import { ChatIcon, CheckIcon, KeyIcon } from "../icons"
import { RestoredText, TokenHighlight } from "../segments"
import { OverlayEditor } from "./OverlayEditor"

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

/** "a, b och c" - comma-joined clauses with "och" before the last. */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} och ${parts[parts.length - 1]}`
}

/**
 * A believable AI reply for the current redaction, written with the very
 * placeholders the model would have received. Restoring it demonstrates the
 * round trip end to end without asking the visitor to actually call an AI.
 * Derived from the live map, so it gains the person's name the moment the
 * model layer adds it. When a scenario id is given, its domain-specific reply
 * is used; otherwise (e.g. "Egen text") a generic reply woven from whichever
 * token types the visitor's own text produced.
 */
export function sampleAiReply(map: Record<string, string>, scenarioId?: string): string {
  const builder = scenarioId ? REPLIES[scenarioId] : undefined
  if (builder) return builder(map)

  const namn = pickToken(map, "NAMN")
  const adress = pickToken(map, "ADRESS")
  const plats = pickToken(map, "PLATS")
  const id = pickToken(map, "PERSONNUMMER", "SAMORDNINGSNUMMER", "ORGANISATIONSNUMMER", "REGNUMMER")
  const contact = pickToken(map, "TELEFON", "EPOST")
  const konto = pickToken(map, "KORTNUMMER", "IBAN", "BANKGIRO", "PLUSGIRO")
  const org = pickToken(map, "ORGANISATION")

  // Weave in at most four placeholders, claimed in demonstrativeness order:
  // enough for the restore card to show several round trips, few enough that
  // the reply still reads as an answer rather than an inventory.
  let budget = namn ? 3 : 4
  const spend = (token: string | null): boolean => {
    if (!token || budget === 0) return false
    budget--
    return true
  }
  const hasAdress = spend(adress)
  const hasPlats = spend(plats)
  const hasId = spend(id)
  const hasContact = spend(contact)
  const hasKonto = spend(konto)
  const hasOrg = spend(org)

  const clauses = [
    `sammanställt ärendet${namn ? ` för ${namn}` : ""}${hasOrg ? ` hos ${org}` : ""}`,
  ]
  if (hasAdress) {
    clauses.push(`noterat adressen ${adress}${hasPlats ? ` i ${plats}` : ""}`)
  } else if (hasPlats) {
    clauses.push(`noterat platsen ${plats}`)
  }
  if (hasId) clauses.push(`stämt av uppgifterna mot ${id}`)

  // Catch-all: the text can mask only types no clause above covers (URL,
  // IP-adress, postnummer, lägenhetsnummer). Rather than reply without a
  // single placeholder, weave the first tokens in generically so the restore
  // card always has something to demonstrate.
  const anyToken = namn || hasAdress || hasPlats || hasId || hasContact || hasKonto || hasOrg
  if (!anyToken) {
    const rest = Object.keys(map).slice(0, 2)
    if (rest.length > 0) clauses.push(`noterat ${joinClauses(rest)}`)
  }

  const pay = hasKonto ? ` Bekräfta att betalning ska ske till ${konto}.` : ""
  const back = hasContact
    ? `Återkoppla${namn ? ` till ${namn}` : ""} på ${contact} och dokumentera bedömningen i systemet.`
    : "Dokumentera bedömningen i systemet och boka en uppföljning."
  return `Tack för underlaget! Jag har ${joinClauses(clauses)}. Förslag på nästa steg finns nedan.${pay} ${back}`
}

/**
 * Step three of the demo: the AI answers with the placeholders still in place,
 * and maskera swaps the originals back in locally, using the key that never
 * left the device. Only rendered when there is something to restore.
 */
export function RestoreDemo({ result, scenarioId }: { result: RedactResult; scenarioId?: string }) {
  const { map } = result
  const auto = useMemo(() => sampleAiReply(map, scenarioId), [map, scenarioId])
  // null = untouched (mirror the generated sample); a string = the visitor's edit.
  const [draft, setDraft] = useState<string | null>(null)
  const reply = draft ?? auto

  return (
    <section className="restore">
      <h2 className="restore-title">Så fungerar återställningen</h2>
      <p className="restore-note">
        AI:n ser platshållare i stället för de uppgifter som maskera upptäckte. När svaret kommer
        tillbaka återställer maskera uppgifterna lokalt. Nyckeln med originaluppgifterna lämnar
        aldrig din enhet.
      </p>
      <div className="flow">
        {/* Arrow and step share a no-wrap unit: when the band wraps on narrow
            screens the arrow follows onto the new line ("→ Du ser") instead of
            dangling at the end of the previous one. */}
        {FLOW.map((step, i) => (
          <span className="flow-item" key={step}>
            {i > 0 && (
              <span className="flow-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="flow-step">
              {i === FLOW.length - 1 && <CheckIcon size={12} />}
              {step}
            </span>
          </span>
        ))}
      </div>
      <div className="grid restore-grid">
        {/* The reply card is inverted (tinted frame, white editor) so this
            second editable textarea reads as an incoming message, not as a
            twin of the visitor's own input card. */}
        <section className="card reply-card">
          <div className="card-head">
            <span className="card-title">
              <ChatIcon size={14} />
              AI:ns svar
            </span>
            {draft !== null ? (
              <button type="button" className="clear" onClick={() => setDraft(null)}>
                Återställ exempel
              </button>
            ) : (
              <span className="card-sub">Simulerat svar, redigera fritt</span>
            )}
          </div>
          <OverlayEditor
            value={reply}
            onChange={setDraft}
            name="ai-response"
            ariaLabel="AI:ns svar med platshållare"
            className="editor reply-editor"
            highlight={<TokenHighlight text={reply} />}
          />
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
    </section>
  )
}
