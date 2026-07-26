import { type ReactNode, useState } from "react"
import { GITHUB, HF_MODEL, NPM_NER } from "../constants"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { CopyButton } from "./CopyButton"
import { TopBar } from "./TopBar"

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
function Code({ children, lang }: { children: string; lang: string }) {
  const src = children
  // One block element per source line. Long lines scroll sideways inside the
  // block (never wrap), so each source line stays on a single visual line.
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
      <div className="code-head">
        <span className="code-lang" aria-hidden="true">
          {lang}
        </span>
        <CopyButton
          text={copyText}
          className="code-copy"
          iconSize={14}
          ariaLabel="Kopiera koden"
          title="Kopiera"
        />
      </div>
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i} className="code-line">
              {highlight(line)}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

// Yarn PnP needs the runtime's undeclared onnxruntime-common import installed
// at the app level. Copy yields just the command for the active tab.
const INSTALL = [
  { id: "npm", cmd: "npm install maskera @huggingface/transformers" },
  { id: "pnpm", cmd: "pnpm add maskera @huggingface/transformers" },
  { id: "bun", cmd: "bun add maskera @huggingface/transformers" },
  {
    id: "yarn",
    cmd: "yarn add maskera @huggingface/transformers@4.2.0 onnxruntime-common@1.24.3",
  },
]

function InstallTabs() {
  const [pm, setPm] = useState(INSTALL[0])
  return (
    <div className="code-block install-tabs">
      <div className="code-head">
        <div className="code-tabs" role="tablist" aria-label="Pakethanterare">
          {INSTALL.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === pm.id}
              aria-controls="install-command"
              id={`install-tab-${p.id}`}
              className={`code-tab${p.id === pm.id ? " on" : ""}`}
              onClick={() => setPm(p)}
            >
              {p.id}
            </button>
          ))}
        </div>
        <CopyButton
          text={pm.cmd}
          className="code-copy"
          iconSize={14}
          ariaLabel="Kopiera koden"
          title="Kopiera"
        />
      </div>
      <pre role="tabpanel" id="install-command" aria-labelledby={`install-tab-${pm.id}`}>
        <code>
          <span className="code-line">{highlight(pm.cmd)}</span>
        </code>
      </pre>
    </div>
  )
}

export function Developers({ go }: { go: (view: View) => void }) {
  return (
    <>
      <TopBar current="dev" go={go} />

      <main id="main-content">
        <article className="prose">
          <h1>För utvecklare</h1>
          <p className="prose-lede">
            Samma motor som på startsidan, ett kommando bort. Allt importeras från ett ställe,{" "}
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              AI-modellen
            </a>{" "}
            laddas ner en gång och sedan körs allt helt lokalt, i webbläsaren (WASM/WebGPU) eller i
            Node.
          </p>

          <figure className="layers-fig">
            {/* Two imgs, not <picture>: the swap follows the theme toggle's
                data-theme attribute (CSS), not the OS media query. The dark
                one is aria-hidden decoration mirroring the first. */}
            <img
              className="layers-light"
              src="/layers-sv.svg"
              width="1200"
              height="640"
              loading="lazy"
              alt="Diagram över maskeras två lager: din text delas upp mellan regler för uppgifter med bestämt format och en svensk AI-modell för fri text, och slås samman till maskerad text."
            />
            <img
              className="layers-dark"
              src="/layers-sv-dark.svg"
              width="1200"
              height="640"
              loading="lazy"
              alt=""
              aria-hidden="true"
            />
            <figcaption>
              Reglerna tar allt med bestämt format, AI-modellen tar fri text som namn och adresser —
              vid överlapp vinner reglerna.
            </figcaption>
          </figure>

          <h2>Installera</h2>
          <InstallTabs />
          <p className="install-note">
            Regler och AI-modell, hela API:t importeras från <code>maskera</code>.
          </p>

          <h2>Maskera en text</h2>
          <Code lang="ts">
            {`import { createNerRecognizer, redactWithNer } from "maskera"

// maskeras svenska modell, ca 43 MB, körs lokalt
const recognizer = createNerRecognizer()

const { text, restore } = await redactWithNer(
  "hej jag heter anna karlsson, personnummer 19900101-2385, och bor i uppsala",
  { recognizer },
)

text
// "hej jag heter [NAMN_1], personnummer [PERSONNUMMER_1], och bor i [PLATS_1]"`}
          </Code>

          <h2>Skicka till AI-tjänsten och återställ svaret</h2>
          <Code lang="ts">
            {`// skicka den maskerade texten till valfri AI
// (OpenAI, Claude, egen modell ...), den ser bara platshållarna
const svar = await fetch("https://api.example.com/chat", {
  method: "POST",
  body: JSON.stringify({ prompt: text }),
}).then((r) => r.text())

restore(svar)
// platshållarna byts tillbaka mot originalen, lokalt`}
          </Code>

          <nav className="prose-foot foot-links" aria-label="Utvecklarresurser">
            <ul>
              <li>
                <a href={NPM_NER} target="_blank" rel="noreferrer">
                  <code>maskera</code> på npm
                </a>
              </li>
              <li>
                <a href={GITHUB} target="_blank" rel="noreferrer">
                  dokumentation och källkod på GitHub
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={HF_MODEL} target="_blank" rel="noreferrer">
                  modellen på Hugging Face
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
            </ul>
          </nav>
        </article>
      </main>
    </>
  )
}
