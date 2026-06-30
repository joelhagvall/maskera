import { type RedactResult, type Redaction, redact } from "@maska/core"
import { type NerRecognizer, createNerRecognizer, redactWithNer } from "@maska/ner"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { demoDetectors, ruleDetectors } from "./detectors"
import { labelSv } from "./labels"
import { type Scenario, scenarios } from "./scenarios"

type NerStatus = "loading" | "ready" | "error"

const GITHUB = "https://github.com/joelhagvall/maska"
const TOKEN_RE = /\[[A-ZÅÄÖ_]+_\d+\]/g

function originalSegments(text: string, redactions: Redaction[]): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const r of redactions) {
    if (r.start > last) nodes.push(text.slice(last, r.start))
    nodes.push(
      <mark key={`${r.start}-${r.label}`} className="hl">
        {text.slice(r.start, r.end)}
      </mark>,
    )
    last = r.end
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function redactedSegments(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let m = TOKEN_RE.exec(text)
  while (m) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <span key={`${m.index}-${m[0]}`} className="token">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    m = TOKEN_RE.exec(text)
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [protect, setProtect] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const [nerStatus, setNerStatus] = useState<NerStatus>("loading")
  const [nerProgress, setNerProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const recognizerRef = useRef<NerRecognizer | null>(null)

  // Instant rule-only result — always available while the model loads.
  const ruleResult = useMemo(() => redact(text, { detectors: demoDetectors }), [text])
  const [result, setResult] = useState<RedactResult>(ruleResult)

  const useNer = nerStatus === "ready"

  useEffect(() => {
    const rec = recognizerRef.current
    if (!useNer || !rec) {
      setResult(ruleResult)
      return
    }
    let cancelled = false
    setAnalyzing(true)
    const timer = setTimeout(() => {
      redactWithNer(text, { recognizer: rec, detectors: ruleDetectors })
        .then((r) => !cancelled && setResult(r))
        .catch(() => !cancelled && setResult(ruleResult))
        .finally(() => !cancelled && setAnalyzing(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, useNer, ruleResult])

  // The Swedish model is always on — auto-loaded once on mount.
  useEffect(() => {
    let cancelled = false
    const rec = createNerRecognizer({
      model: "maska-sv-ner",
      localModelPath: "/models/",
      allowLocalModels: true,
      allowRemoteModels: false,
      dtype: "q8",
      device: "wasm",
      onProgress: (p) => {
        const prog = p as { status?: string; progress?: number }
        if (prog?.status === "progress" && typeof prog.progress === "number") {
          setNerProgress(Math.round(prog.progress))
        }
      },
    })
    recognizerRef.current = rec
    rec.ready
      .then(() => !cancelled && setNerStatus("ready"))
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          recognizerRef.current = null
          setNerStatus("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

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
      <header className="header">
        <div className="head-row">
          <span className="wordmark">maska</span>
          <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <h1 className="title">Maska personuppgifter innan AI:n ser dem.</h1>
        <p className="lede">
          Körs helt lokalt i webbläsaren — ingen text lämnar din enhet. Regler fångar det
          strukturerade (personnummer, org-nr…), en svensk modell fångar namn och platser.
        </p>
      </header>

      <div className="controls">
        <div className="tabs">
          {scenarios.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`tab ${s.id === active.id ? "on" : ""}`}
              onClick={() => pick(s)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="status">
          <span className={`dot ${nerStatus}`} />
          {nerStatus === "loading" && <span>Laddar modell {nerProgress}% · regler aktiva</span>}
          {nerStatus === "ready" && (
            <span>Svensk modell aktiv{analyzing ? " · analyserar" : ""}</span>
          )}
          {nerStatus === "error" && <span>Modell ej laddad · regler aktiva</span>}
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-head">
            <span className="card-title">Indata</span>
            <span className="card-sub">{active.tagline}</span>
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

        <section className="card">
          <div className="card-head">
            <span className="card-title">{protect ? "Vad AI:n ser" : "Utan maska"}</span>
            <button
              type="button"
              role="switch"
              aria-checked={protect}
              className={`switch ${protect ? "on" : ""}`}
              onClick={() => setProtect((v) => !v)}
            >
              <span className="knob" />
            </button>
          </div>
          <div className={`output ${protect ? "" : "raw"}`}>
            {protect ? redactedSegments(result.text) : text}
          </div>

          <div className="stats">
            <div className="count">
              <span className="num">{result.redactions.length}</span>
              <span className="num-l">
                {protect ? "uppgifter maskade" : "uppgifter exponerade"}
              </span>
            </div>
            <div className="tags">
              {counts.map(([label, n]) => (
                <span key={label} className="tag">
                  {labelSv(label)}
                  <span className="tag-n">{n}</span>
                </span>
              ))}
            </div>
          </div>

          <button type="button" className="link" onClick={() => setShowMap((v) => !v)}>
            {showMap ? "Dölj" : "Visa"} återställning ({unique})
          </button>
          {showMap && (
            <div className="map">
              <p className="map-note">
                Mappningen stannar lokalt. AI:n ser bara platshållarna; du återställer originalet på
                din enhet.
              </p>
              <table>
                <tbody>
                  {Object.entries(result.map).map(([token, value]) => (
                    <tr key={token}>
                      <td className="mono">{token}</td>
                      <td className="arrow">→</td>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <footer className="footer">
        Drivs av <code>@maska/core</code> + en distillerad svensk NER-modell, båda i webbläsaren.
        Ingen data skickas någonstans.{" "}
        <a href={`${GITHUB}/blob/main/docs/TRANSPARENCY.md`} target="_blank" rel="noreferrer">
          Transparens
        </a>
      </footer>
    </div>
  )
}
