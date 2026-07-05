import { type ReactNode, useRef, useState } from "react"
import { GITHUB, HF_MODEL, NPM_NER } from "../constants"
import { ArrowUpRightIcon, CheckIcon, CopyIcon, MaskeraMark } from "../icons"
import { navClick, viewPaths } from "../routing"

// Order matters: comments win over strings win over keywords/function names.
const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|const|await)\b|([A-Za-z_$][\w$]*)(?=\()/g

function highlight(line: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  TOKEN.lastIndex = 0
  let m = TOKEN.exec(line)
  while (m) {
    if (m.index > last) nodes.push(line.slice(last, m.index))
    const cls = m[1] ? "tok-c" : m[2] ? "tok-s" : m[3] ? "tok-k" : "tok-f"
    nodes.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
    m = TOKEN.exec(line)
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

/** Tiny syntax highlighter for the static snippets below. */
function Code({ children }: { children: string }) {
  const src = children
  // One block element per source line: on mobile, wrapped continuations get
  // a hanging indent so a long command reads as one line, not as cut off.
  const lines = src.split("\n")
  // Copy the runnable part only: comment-only lines are display guidance
  // ("# allt i ett: ..."), not something to paste into a terminal.
  const copyText = src
    .split("\n")
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith("#") && !t.startsWith("//")
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return (
    <div className="code-block">
      <pre>
        <code>
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static content, never reorders
            <span key={i} className="code-line">
              {highlight(line)}
            </span>
          ))}
        </code>
      </pre>
      <CopyButton text={copyText} />
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
      <a className="back" href={viewPaths.demo} onClick={navClick(onBack)}>
        ← Tillbaka till startsidan
      </a>

      <main>
        <article className="prose">
          <h1>För utvecklare</h1>
          <p className="prose-lede">
            Samma motor som du just testade, ett kommando bort. Allt importeras från ett ställe,{" "}
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              AI-modellen
            </a>{" "}
            laddas ner en gång och sedan körs allt helt lokalt, i webbläsaren (WASM/WebGPU) eller i
            Node.
          </p>

          <h2>Installera</h2>
          <Code>
            {`npm install maskera @huggingface/transformers
# regler + AI-modell, hela API:t importeras från maskera`}
          </Code>

          <h2>Maskera en text</h2>
          <Code>
            {`import { createNerRecognizer, redactWithNer } from "maskera"

// maskeras svenska modell, ca 40 MB, körs lokalt
const recognizer = createNerRecognizer()

const { text, restore } = await redactWithNer(
  "hej jag heter anna karlsson, personnummer 19900101-2385, och bor i uppsala",
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

          <p className="prose-foot foot-links">
            <a href={NPM_NER} target="_blank" rel="noreferrer">
              <code>maskera</code> på npm
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              dokumentation och källkod på GitHub
              <ArrowUpRightIcon size={13} />
            </a>
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              modellen på Hugging Face
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
