import { type RedactResult, type Redaction, redact } from "@maska/core"
import { type NerRecognizer, createNerRecognizer, redactWithNer } from "@maska/ner"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { demoDetectors, ruleDetectors } from "./detectors"
import { labelMeta } from "./labels"
import { type Scenario, scenarios } from "./scenarios"

type NerStatus = "off" | "loading" | "ready" | "error"

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
  const [nerOn, setNerOn] = useState(false)
  const [nerStatus, setNerStatus] = useState<NerStatus>("off")
  const [nerProgress, setNerProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const recognizerRef = useRef<NerRecognizer | null>(null)

  // Synchronous rule-only result — always available, instant.
  const ruleResult = useMemo(() => redact(text, { detectors: demoDetectors }), [text])
  const [result, setResult] = useState<RedactResult>(ruleResult)

  const useNer = nerOn && nerStatus === "ready"

  // When NER is active, recompute the hybrid result (debounced). Otherwise the
  // instant rule-only result is the source of truth.
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

  async function toggleNer(on: boolean) {
    setNerOn(on)
    if (!on) {
      setNerStatus("off")
      return
    }
    if (recognizerRef.current) {
      setNerStatus("ready")
      return
    }
    setNerStatus("loading")
    setNerProgress(0)
    // Load OUR distilled Swedish model from the demo's /public/models folder.
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
    try {
      await rec.ready
      setNerStatus("ready")
    } catch (err) {
      console.error(err)
      recognizerRef.current = null
      setNerStatus("error")
    }
  }

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

      <div className="nerbar">
        <label className="toggle ner">
          <input type="checkbox" checked={nerOn} onChange={(e) => toggleNer(e.target.checked)} />
          <span>🧠 Svensk NER-modell (lokal)</span>
        </label>
        {nerStatus === "loading" && (
          <span className="nerstat">
            Laddar modell… {nerProgress}%
            <span className="bar">
              <span className="fill" style={{ width: `${nerProgress}%` }} />
            </span>
          </span>
        )}
        {nerStatus === "ready" && (
          <span className="nerstat ok">
            ● Svensk modell aktiv{analyzing ? " · analyserar…" : ""}
          </span>
        )}
        {nerStatus === "error" && (
          <span className="nerstat err">Kunde inte ladda modellen (se konsolen)</span>
        )}
        {nerStatus === "off" && (
          <span className="nerstat muted">Av — namn fångas av offline-gazetteer</span>
        )}
        <span className="nerhint">
          Vår distillerade KB-BERT (~80 MB, körs i webbläsaren). Fångar godtyckliga svenska
          namn/platser/organisationer — reglerna sköter personnummer m.m.
        </span>
      </div>

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
        PII (personnummer, org-nr…) fångas av checksummevaliderade regler.
        Namn/platser/organisationer kommer från en offline-gazetteer, eller — när du slår på
        modellen ovan — från vår egen distillerade svenska NER-modell via <code>@maska/ner</code>,
        även den i webbläsaren.
      </footer>
    </div>
  )
}
