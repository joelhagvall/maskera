import type { RedactResult } from "@maskera/core"
import { useMemo, useState } from "react"
import copy from "../i18n"
import { ChatIcon, CheckIcon, KeyIcon } from "../icons"
import { RestoredText, TokenHighlight } from "../segments"
import { OverlayEditor } from "./OverlayEditor"

function fill(template: string, values: Record<string, string | null>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
}

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
    const who = namn ? fill(copy.restoreDemo.replies.hr.person, { name: namn }) : ""
    const back = namn
      ? fill(copy.restoreDemo.replies.hr.contact, {
          name: namn,
          email: email ? fill(copy.restoreDemo.replies.hr.email, { email }) : "",
        })
      : copy.restoreDemo.replies.hr.fallback
    return `${fill(copy.restoreDemo.replies.hr.lead, { person: who })} ${back}`
  },
  support: (map) => {
    const namn = pickToken(map, "NAMN")
    const card = pickToken(map, "KORTNUMMER")
    const contact = pickToken(map, "TELEFON", "EPOST")
    const who = namn ? fill(copy.restoreDemo.replies.support.person, { name: namn }) : ""
    const sparr = card ? fill(copy.restoreDemo.replies.support.card, { card }) : ""
    const back = contact
      ? fill(copy.restoreDemo.replies.support.contact, {
          person: namn ? fill(copy.restoreDemo.replies.support.contactPerson, { name: namn }) : "",
          contact,
        })
      : copy.restoreDemo.replies.support.fallback
    return `${fill(copy.restoreDemo.replies.support.lead, { person: who, card: sparr })} ${back}`
  },
  vard: (map) => {
    const namn = pickToken(map, "NAMN")
    const email = pickToken(map, "EPOST")
    const phone = pickToken(map, "TELEFON")
    const who = namn ? fill(copy.restoreDemo.replies.vard.person, { name: namn }) : ""
    const parts = [fill(copy.restoreDemo.replies.vard.lead, { person: who })]
    if (email) parts.push(fill(copy.restoreDemo.replies.vard.email, { email }))
    if (phone) parts.push(fill(copy.restoreDemo.replies.vard.phone, { phone }))
    return parts.join(" ")
  },
  juridik: (map) => {
    const namn = pickToken(map, "NAMN")
    const konto = pickToken(map, "BANKGIRO", "IBAN", "PLUSGIRO")
    const who = namn ? fill(copy.restoreDemo.replies.juridik.person, { name: namn }) : ""
    const parts = [fill(copy.restoreDemo.replies.juridik.lead, { person: who })]
    if (konto) parts.push(fill(copy.restoreDemo.replies.juridik.payment, { account: konto }))
    parts.push(copy.restoreDemo.replies.juridik.closing)
    return parts.join(" ")
  },
  kommun: (map) => {
    const namn = pickToken(map, "NAMN")
    const email = pickToken(map, "EPOST")
    const who = namn ? fill(copy.restoreDemo.replies.kommun.person, { name: namn }) : ""
    const parts = [fill(copy.restoreDemo.replies.kommun.lead, { person: who })]
    if (namn && email)
      parts.push(fill(copy.restoreDemo.replies.kommun.contact, { name: namn, email }))
    return parts.join(" ")
  },
}

/** "a, b och c" - comma-joined clauses with "och" before the last. */
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} ${copy.restoreDemo.joinWord} ${parts[parts.length - 1]}`
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
    `${copy.restoreDemo.generic.case}${namn ? ` ${copy.restoreDemo.generic.for} ${namn}` : ""}${hasOrg ? ` ${copy.restoreDemo.generic.atOrganization} ${org}` : ""}`,
  ]
  if (hasAdress) {
    clauses.push(
      `${copy.restoreDemo.generic.address} ${adress}${hasPlats ? ` ${copy.restoreDemo.generic.inPlace} ${plats}` : ""}`,
    )
  } else if (hasPlats) {
    clauses.push(`${copy.restoreDemo.generic.place} ${plats}`)
  }
  if (hasId) clauses.push(`${copy.restoreDemo.generic.checked} ${id}`)

  // Catch-all: the text can mask only types no clause above covers (URL,
  // IP-adress, postnummer, lägenhetsnummer). Rather than reply without a
  // single placeholder, weave the first tokens in generically so the restore
  // card always has something to demonstrate.
  const anyToken = namn || hasAdress || hasPlats || hasId || hasContact || hasKonto || hasOrg
  if (!anyToken) {
    const rest = Object.keys(map).slice(0, 2)
    if (rest.length > 0) clauses.push(`${copy.restoreDemo.generic.noted} ${joinClauses(rest)}`)
  }

  const pay = hasKonto ? fill(copy.restoreDemo.generic.payment, { token: konto }) : ""
  const back = hasContact
    ? fill(copy.restoreDemo.generic.contact, {
        person: namn ? fill(copy.restoreDemo.generic.contactPerson, { name: namn }) : "",
        contact,
      })
    : copy.restoreDemo.generic.fallback
  return [fill(copy.restoreDemo.generic.lead, { clauses: joinClauses(clauses) }), pay, back]
    .filter(Boolean)
    .join(" ")
}

/**
 * Step three of the demo: the AI answers with the placeholders still in place,
 * and maskera swaps the originals back in locally, using the key that never
 * left the device. Only rendered when there is something to restore.
 */
export function RestoreDemo({ result, scenarioId }: { result: RedactResult; scenarioId?: string }) {
  const { map } = result
  const flow = copy.restoreDemo.flow
  const auto = useMemo(() => sampleAiReply(map, scenarioId), [map, scenarioId])
  // null = untouched (mirror the generated sample); a string = the visitor's edit.
  const [draft, setDraft] = useState<string | null>(null)
  const reply = draft ?? auto

  return (
    <section className="restore">
      <h2 className="restore-title">{copy.restoreDemo.title}</h2>
      <p className="restore-note">{copy.restoreDemo.body}</p>
      <div className="flow">
        {/* Arrow and step share a no-wrap unit: when the band wraps on narrow
            screens the arrow follows onto the new line ("→ Du ser") instead of
            dangling at the end of the previous one. */}
        {flow.map((step, i) => (
          <span className="flow-item" key={step}>
            {i > 0 && (
              <span className="flow-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="flow-step">
              {i === flow.length - 1 && <CheckIcon size={12} />}
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
              {copy.restoreDemo.replyTitle}
            </span>
            {draft !== null ? (
              <button type="button" className="clear" onClick={() => setDraft(null)}>
                {copy.restoreDemo.resetExample}
              </button>
            ) : (
              <span className="card-sub">{copy.restoreDemo.editableExample}</span>
            )}
          </div>
          <OverlayEditor
            value={reply}
            onChange={setDraft}
            name="ai-response"
            ariaLabel={copy.restoreDemo.replyAria}
            className="editor reply-editor"
            language="sv"
            highlight={<TokenHighlight text={reply} />}
          />
        </section>
        <section className="card">
          <div className="card-head">
            <span className="card-title">
              <KeyIcon size={14} />
              {copy.restoreDemo.restoredTitle}
            </span>
          </div>
          <div className="output restored" lang="sv" translate="no">
            <RestoredText text={reply} map={map} />
          </div>
        </section>
      </div>
    </section>
  )
}
