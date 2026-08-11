import { type KeyboardEvent, type ReactNode, useRef, useState } from "react"
import { GITHUB, HF_MODEL, NPM_NER } from "../constants"
import copy, { activeLocale } from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { CopyButton } from "./CopyButton"
import { TopBar } from "./TopBar"

// Order matters: comments win over strings win over keywords/function names.
const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|type|const|await)\b|([A-Za-z_$][\w$]*)(?=\()/g

type CodeLanguage = "ts" | "js"

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
function Code({
  children,
  language,
  onLanguageChange,
  languageLabel,
}: {
  children: string
  language?: CodeLanguage
  onLanguageChange?: (language: CodeLanguage) => void
  languageLabel?: string
}) {
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
    <div className={`code-block snippet-code${languageLabel ? " shared-language-code" : ""}`}>
      <div className="code-head">
        {language && onLanguageChange ? (
          <div className="code-tabs" role="group" aria-label={copy.developerApi.codeLanguageLabel}>
            {(["ts", "js"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={language === option}
                className={`code-tab${language === option ? " on" : ""}`}
                onClick={() => onLanguageChange(option)}
              >
                {option.toUpperCase()}
                <span className="sr-only">
                  {" – "}
                  {option === "ts"
                    ? copy.developerApi.typescriptLabel
                    : copy.developerApi.javascriptLabel}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span className="shared-language-label">{languageLabel}</span>
        )}
        <CopyButton
          text={copyText}
          className="code-copy"
          iconSize={14}
          ariaLabel={copy.copyButton.copyCode}
          title={copy.copyButton.copy}
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectTab(index: number) {
    setPm(INSTALL[index])
    tabRefs.current[index]?.focus()
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === "ArrowRight") nextIndex = (index + 1) % INSTALL.length
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + INSTALL.length) % INSTALL.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = INSTALL.length - 1
    if (nextIndex === null) return

    event.preventDefault()
    selectTab(nextIndex)
  }

  return (
    <div className="code-block install-tabs">
      <div className="code-head">
        <div
          className="code-tabs"
          role="tablist"
          aria-label={copy.developerApi.packageManagerLabel}
        >
          {INSTALL.map((p, index) => (
            <button
              key={p.id}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              aria-selected={p.id === pm.id}
              aria-controls="install-command"
              id={`install-tab-${p.id}`}
              tabIndex={p.id === pm.id ? 0 : -1}
              className={`code-tab${p.id === pm.id ? " on" : ""}`}
              onClick={() => setPm(p)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {p.id}
            </button>
          ))}
        </div>
        <CopyButton
          text={pm.cmd}
          className="code-copy"
          iconSize={14}
          ariaLabel={copy.copyButton.copyCode}
          title={copy.copyButton.copy}
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

function ArchitectureFigure({ onCoverage }: { onCoverage: () => void }) {
  const lightDiagram = activeLocale === "sv" ? "/layers-sv.svg" : "/layers.svg"
  const darkDiagram = activeLocale === "sv" ? "/layers-sv-dark.svg" : "/layers-dark.svg"

  return (
    <figure className="layers-fig">
      <img
        className="layers-light"
        src={lightDiagram}
        width="1200"
        height="640"
        loading="lazy"
        alt={copy.developerApi.diagramAlt}
      />
      <img
        className="layers-dark"
        src={darkDiagram}
        width="1200"
        height="640"
        loading="lazy"
        alt=""
        aria-hidden="true"
      />
      <figcaption>
        {copy.developerApi.diagramCaption} {copy.coverage.developersLink}{" "}
        <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
          {copy.coverage.linkCta}
        </a>
        <a className="layers-expand" href={lightDiagram} target="_blank" rel="noreferrer">
          {copy.developerApi.diagramOpen}
          <ArrowUpRightIcon size={13} />
        </a>
      </figcaption>
    </figure>
  )
}

export function Developers({
  go,
  onCoverage,
}: {
  go: (view: View) => void
  onCoverage: () => void
}) {
  const [language, setLanguage] = useState<CodeLanguage>("ts")
  const maskExample =
    language === "ts" ? copy.developerApi.maskExampleTs : copy.developerApi.maskExampleJs
  const restoreExample =
    language === "ts" ? copy.developerApi.restoreExampleTs : copy.developerApi.restoreExampleJs

  return (
    <>
      <header>
        <TopBar current="dev" go={go} />
      </header>

      <main id="main-content">
        <article className="prose">
          <h1>{copy.developerApi.title}</h1>
          <p className="prose-lede">
            {copy.developerApi.lede}{" "}
            <a href={HF_MODEL} target="_blank" rel="noreferrer">
              {copy.developerApi.modelLink}
            </a>{" "}
            {copy.developerApi.modelSuffix}
          </p>

          <h2>{copy.developerApi.installTitle}</h2>
          <InstallTabs />
          <p className="install-note">{copy.developerApi.installNote}</p>
          <aside className="developer-notes" aria-labelledby="developer-notes-title">
            <p id="developer-notes-title" className="developer-notes-title">
              {copy.developerApi.practicalTitle}
            </p>
            <ul>
              {copy.developerApi.practicalItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a
              className="developer-notes-link"
              href={`${GITHUB}/blob/main/packages/ner/README.md`}
              target="_blank"
              rel="noreferrer"
            >
              {copy.developerApi.practicalDocsCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </aside>

          <h2>{copy.developerApi.maskTitle}</h2>
          <Code language={language} onLanguageChange={setLanguage}>
            {maskExample}
          </Code>

          <ArchitectureFigure onCoverage={onCoverage} />

          <h2>{copy.developerApi.restoreTitle}</h2>
          <Code language={language} onLanguageChange={setLanguage}>
            {restoreExample}
          </Code>

          <h2>{copy.developerApi.clinicalTitle}</h2>
          <p className="prose-note">
            {copy.developerApi.clinicalBody}{" "}
            <a
              href={`${GITHUB}/blob/main/packages/ner/README.md#clinical-profile`}
              target="_blank"
              rel="noreferrer"
            >
              {copy.developerApi.clinicalDocsCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
          <Code languageLabel={copy.developerApi.sharedLanguageLabel}>
            {copy.developerApi.clinicalCode}
          </Code>

          <nav className="prose-foot foot-links" aria-label={copy.developerApi.resourcesLabel}>
            <ul>
              <li>
                <a href={NPM_NER} target="_blank" rel="noreferrer">
                  {copy.developerApi.npmCta}
                </a>
              </li>
              <li>
                <a href={GITHUB} target="_blank" rel="noreferrer">
                  {copy.developerApi.githubCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={HF_MODEL} target="_blank" rel="noreferrer">
                  {copy.developerApi.modelCta}
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
