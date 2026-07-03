import type { RedactResult } from "@maskera/core"
import { useMemo, useState } from "react"
import { EyeIcon, EyeOffIcon } from "../icons"
import { labelMeta } from "../labels"
import { RedactedText } from "../segments"
import { Switch } from "./ui"

function Stats({ result, protect }: { result: RedactResult; protect: boolean }) {
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const r of result.redactions) c.set(r.label, (c.get(r.label) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [result])

  return (
    <div className="stats">
      <div className="count">
        <span className="num">{result.redactions.length}</span>
        <span className="num-l">{protect ? "uppgifter maskerade" : "uppgifter exponerade"}</span>
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

export function OutputCard({ result, original }: { result: RedactResult; original: string }) {
  const [protect, setProtect] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const unique = Object.keys(result.map).length

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">
          {protect ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
          {protect ? "Vad AI:n ser" : "Utan maskera"}
        </span>
        <Switch checked={protect} onChange={setProtect} label="Maskera personuppgifter" />
      </div>

      <div className={`output ${protect ? "" : "raw"}`}>
        {protect ? <RedactedText text={result.text} /> : original}
      </div>

      <Stats result={result} protect={protect} />

      <button type="button" className="link" onClick={() => setShowMap((v) => !v)}>
        {showMap ? "Dölj" : "Visa"} återställningsnyckel ({unique})
      </button>
      {showMap && <RestoreMap map={result.map} />}
    </section>
  )
}
