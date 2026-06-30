import { type Redaction, redact } from "@maska/core"
import { type ReactNode, useMemo, useRef, useState } from "react"
import { demoDetectors } from "./detectors"
import { labelMeta } from "./labels"
import { type Scenario, scenarios } from "./scenarios"

const GITHUB = "https://github.com/joelhagvall/maska"

function originalSegments(text: string, redactions: Redaction[]): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const r of redactions) {
    if (r.start > last) nodes.push(text.slice(last, r.start))
    const { color } = labelMeta(r.label)
    nodes.push(
      <mark
        key={`${r.start}-${r.label}`}
        className="hl"
        style={{ background: `${color}33`, boxShadow: `inset 0 -2px ${color}` }}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    )
    last = r.end
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function redactedSegments(text: string): ReactNode[] {
  const re = /\[[A-ZÅÄÖ_]+_\d+\]/g
  const nodes: ReactNode[] = []
  let last = 0
  let m = re.exec(text)
  while (m) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const label = m[0].replace(/^\[|_\d+\]$/g, "")
    const { color } = labelMeta(label)
    nodes.push(
      <span
        key={`${m.index}-${m[0]}`}
        className="token"
        style={{ color, borderColor: `${color}66` }}
      >
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    m = re.exec(text)
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [protect, setProtect] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  const result = useMemo(() => redact(text, { detectors: demoDetectors }), [text])

  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const r of result.redactions) c.set(r.label, (c.get(r.label) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [result])

  const unique = Object.keys(result.map).length

  function pick(s: Scenario) {
    setActive(s)
    setText(s.text)
    setShowMap(false)
  }

  function syncScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <span className="logo">maska</span>
          <span className="dot" />
          <span className="sub">svensk integritet för AI</span>
        </div>
        <p className="pitch">
          Personuppgifter maskas <strong>lokalt i webbläsaren</strong> — innan texten någonsin når
          en AI-modell, en logg eller analytics. Skriv fritt nedan och se det hända live.
        </p>
        <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
          ★ GitHub
        </a>
      </header>

      <nav className="domains">
        {scenarios.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`domain ${s.id === active.id ? "on" : ""}`}
            onClick={() => pick(s)}
          >
            <span className="demoji">{s.icon}</span>
            <span className="dname">{s.name}</span>
          </button>
        ))}
      </nav>

      <div className="stage">
        <section className="panel">
          <div className="phead">
            <h2>✍️ Vad användaren skriver</h2>
            <span className="hint">{active.tagline} — redigerbart</span>
          </div>
          <div className="editor">
            <div className="backdrop" ref={backdropRef} aria-hidden>
              {originalSegments(text, result.redactions)}
              {"\n"}
            </div>
            <textarea
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onScroll={syncScroll}
            />
          </div>
        </section>

        <section className="panel">
          <div className="phead">
            <h2>{protect ? "🛡️ Vad AI:n / loggen ser" : "⚠️ Utan maska"}</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={protect}
                onChange={(e) => setProtect(e.target.checked)}
              />
              <span>Skydd {protect ? "PÅ" : "AV"}</span>
            </label>
          </div>
          <div className={`output ${protect ? "" : "danger"}`}>
            {protect ? redactedSegments(result.text) : text}
          </div>

          <div className="stats">
            <div className="bignum">
              <span className="n">{result.redactions.length}</span>
              <span className="l">känsliga uppgifter {protect ? "skyddade" : "EXPONERADE"}</span>
            </div>
            <div className="chips">
              {counts.map(([label, n]) => {
                const m = labelMeta(label)
                return (
                  <span
                    key={label}
                    className="chip"
                    style={{ borderColor: `${m.color}66`, color: m.color }}
                  >
                    {m.sv} <b>{n}</b>
                  </span>
                )
              })}
            </div>
          </div>

          <button type="button" className="maplink" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Dölj" : "Visa"} återställning ({unique} unika värden, lokalt)
          </button>
          {showMap && (
            <div className="map">
              <p className="mapnote">
                Mappningen stannar i webbläsaren. När AI:n svarar med platshållarna kan du
                återställa originalvärdena lokalt — modellen såg dem aldrig.
              </p>
              <table>
                <tbody>
                  {Object.entries(result.map).map(([token, value]) => {
                    const label = token.replace(/^\[|_\d+\]$/g, "")
                    return (
                      <tr key={token}>
                        <td style={{ color: labelMeta(label).color }}>{token}</td>
                        <td>→</td>
                        <td>{value}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer className="foot">
        Drivs av <code>@maska/core</code> — noll beroenden, körs helt i din webbläsare. Strukturerad
        PII är checksummevaliderad; namn/platser i denna demo använder en liten offline-gazetteer (i
        produktion: <code>@maska/ner</code>).
      </footer>
    </div>
  )
}
