import { type ReactNode, useRef, useState } from "react"
import { GITHUB, HF_MODEL, NPM_CORE, NPM_NER } from "../constants"
import { ArrowUpRightIcon, CheckIcon, CopyIcon, MaskeraMark } from "../icons"

// Order matters: comments win over strings win over keywords/function names.
const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|const|await)\b|([A-Za-z_$][\w$]*)(?=\()/g

/** Tiny syntax highlighter for the static snippets below. */
function Code({ children }: { children: string }) {
  const src = children
  const nodes: ReactNode[] = []
  let last = 0
  let m = TOKEN.exec(src)
  while (m) {
    if (m.index > last) nodes.push(src.slice(last, m.index))
    const cls = m[1] ? "tok-c" : m[2] ? "tok-s" : m[3] ? "tok-k" : "tok-f"
    nodes.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    m = TOKEN.exec(src)
  }
  if (last < src.length) nodes.push(src.slice(last))
  return (
    <div className="code-block">
      <pre>
        <code>{nodes}</code>
      </pre>
      <CopyButton text={src} />
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return // clipboard unavailable (permissions/insecure context): keep quiet
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }
  return (
    <button
      type="button"
      className={`code-copy${copied ? " copied" : ""}`}
      onClick={copy}
      aria-label={copied ? "Kopierad" : "Kopiera koden"}
      title="Kopiera"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? "Kopierad" : "Kopiera"}
    </button>
  )
}

export function Developers({ onBack }: { onBack: () => void }) {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">
          <MaskeraMark size={20} />
          maskera
        </span>
        <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
          GitHub
          <ArrowUpRightIcon size={13} />
        </a>
      </div>
      <button type="button" className="back" onClick={onBack}>
        ← Tillbaka till demon
      </button>

      <main>
        <article className="prose">
          <h1>För utvecklare</h1>
          <p className="prose-lede">
            Samma motor som driver demon, ett kommando bort. <code>@maskera/ner</code> drar in
            regellagret <code>@maskera/core</code> automatiskt och hela API:t importeras från ett
            ställe.{" "}
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              AI-modellen
            </a>{" "}
            laddas ner en gång och körs sedan helt lokalt, i webbläsaren (WASM/WebGPU) eller i Node.
          </p>

          <h2>Installera</h2>
          <Code>
            {`npm install @maskera/ner @huggingface/transformers
# allt i ett: regler + AI-modell, @maskera/core följer med automatiskt`}
          </Code>

          <h2>Maskera en text</h2>
          <Code>
            {`import { createNerRecognizer, redactWithNer } from "@maskera/ner"

const recognizer = createNerRecognizer() // maskeras svenska modell, ca 40 MB, körs lokalt

const { text, restore } = await redactWithNer(
  "hej jag heter anna karlsson, personnummer 19900101-0017, och bor i uppsala",
  { recognizer },
)

text
// "hej jag heter [PERSON_1], personnummer [PERSONNUMMER_1], och bor i [LOCATION_1]"`}
          </Code>

          <h2>Skicka till AI-tjänsten och återställ svaret</h2>
          <Code>
            {`const svar = await minAiTjanst(text) // tjänsten ser bara platshållarna

restore(svar)
// platshållarna byts tillbaka mot originalen, lokalt`}
          </Code>

          <h2>Bara reglerna, utan modell</h2>
          <p className="prose-note">
            Vill du slippa modellen helt? <code>@maskera/core</code> klarar allt som har ett bestämt
            format på egen hand, utan beroenden och utan nätverk. Bra när det ska vara litet och
            snabbt.
          </p>
          <Code>
            {`npm install @maskera/core
# bara reglerna, noll beroenden`}
          </Code>
          <Code>
            {`import { redact } from "@maskera/core"

const { text } = redact("Ring mig på 070-123 45 67, pnr 19900101-0017")
// "Ring mig på [PHONE_1], pnr [PERSONNUMMER_1]"`}
          </Code>

          <p className="prose-foot">
            Paketen finns på npm:{" "}
            <a href={NPM_CORE} target="_blank" rel="noreferrer">
              <code>@maskera/core</code>
            </a>{" "}
            och{" "}
            <a href={NPM_NER} target="_blank" rel="noreferrer">
              <code>@maskera/ner</code>
            </a>
            . Fullständig dokumentation, benchmarks och all källkod finns på{" "}
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub
              <ArrowUpRightIcon size={13} />
            </a>
            . Modellen ligger öppet på{" "}
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              Hugging Face
              <ArrowUpRightIcon size={13} />
            </a>
            .
          </p>
        </article>
      </main>
    </>
  )
}
