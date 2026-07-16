import type { RedactResult } from "@maskera/core"
import { useMemo, useState } from "react"
import { CheckIcon, CopyIcon, EyeIcon } from "../icons"
import { labelMeta } from "../labels"
import { RedactedText } from "../segments"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="clear copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => {},
        )
      }}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
      {copied ? "Kopierat" : "Kopiera"}
    </button>
  )
}

function Stats({ result }: { result: RedactResult }) {
  const counts = useMemo(() => {
    // Redactions arrive position-sorted, so Map insertion order = text order.
    const c = new Map<string, number>()
    for (const r of result.redactions) c.set(r.label, (c.get(r.label) ?? 0) + 1)
    return [...c.entries()]
  }, [result])

  return (
    <div className="stats">
      <div className="count">
        <span className="num">{result.redactions.length}</span>
        <span className="num-l">
          {result.redactions.length === 1 ? "uppgift maskerad" : "uppgifter maskerade"}
        </span>
      </div>
      <div className="tags">
        {counts.map(([label, n]) => {
          const m = labelMeta(label)
          return (
            <span key={label} className="tag">
              <span className="tag-dot" style={{ background: m.color }} />
              {m.sv}
              <span className="tag-n">{n}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RestoreMap({ map }: { map: Record<string, string> }) {
  return (
    <div className="map">
      <p className="map-note">
        Nyckeln stannar på din enhet. AI-tjänsten ser bara platshållarna, och med nyckeln kan du
        sätta tillbaka originalen i svaret efteråt.
      </p>
      <table>
        <tbody>
          {Object.entries(map).map(([token, value]) => (
            <tr key={token}>
              <td className="mono">{token}</td>
              <td className="arrow">→</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OutputCard({
  result,
  analyzing,
  invalidPnrs,
  showMap,
  onToggleMap,
}: {
  result: RedactResult
  analyzing: boolean
  invalidPnrs: string[]
  /** Owned by App so the toggle survives scenario switches. */
  showMap: boolean
  onToggleMap: () => void
}) {
  const unique = Object.keys(result.map).length

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">
          <EyeIcon size={14} />
          Vad AI:n ser
          {analyzing && <span className="card-sub">analyserar…</span>}
        </span>
        {result.text ? <CopyButton text={result.text} /> : null}
      </div>

      <div className={`output ${analyzing ? "analyzing" : ""}`}>
        <RedactedText text={result.text} />
      </div>

      {/* 19900101-2385 är ett av Skatteverkets reserverade testpersonnummer
          (öppna data, spärrat från att någonsin tilldelas en verklig person),
          så demon uppmanar aldrig någon att skriva in ett riktigt nummer. */}
      {invalidPnrs.length > 0 && (
        <p className="checksum-note">
          <span className="mono">{invalidPnrs.join(", ")}</span>{" "}
          {invalidPnrs.length === 1
            ? "ser ut som ett personnummer men kontrollsiffran stämmer inte, så det kan inte vara ett riktigt. Därför maskas det inte."
            : "ser ut som personnummer men kontrollsiffrorna stämmer inte, så de kan inte vara riktiga. Därför maskas de inte."}{" "}
          Testa med ett giltigt nummer, t.ex. 19900101-2385.
        </p>
      )}

      <Stats result={result} />

      {unique > 0 && (
        <>
          <button type="button" className="link" onClick={onToggleMap}>
            {showMap ? "Dölj" : "Visa"} återställningsnyckel ({unique})
          </button>
          {showMap && <RestoreMap map={result.map} />}
        </>
      )}
    </section>
  )
}
