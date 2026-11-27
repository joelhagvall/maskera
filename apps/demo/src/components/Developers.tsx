import { type KeyboardEvent, useRef, useState } from "react"
import { GITHUB, HF_MODEL, NPM_MCP, NPM_NER } from "../constants"
import { highlight } from "../highlight"
import copy, { activeLocale } from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { AgentSetupCard } from "./AgentSetupCard"
import { Code } from "./CodeSnippet"
import { CopyButton } from "./CopyButton"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

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
        {copy.developerApi.diagramCaption}{" "}
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
  goSection,
  onCoverage,
}: {
  go: (view: View) => void
  goSection?: (view: View, id: string) => void
  onCoverage: () => void
}) {
  const dev = copy.developerApi

  return (
    <>
      <header>
        <TopBar current="dev" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc">
          <h1>{dev.title}</h1>
          <p className="prose-lede">{dev.lede}</p>

          <PageToc items={dev.toc} />

          <h2 id="agenter">{dev.agentsTitle}</h2>
          <p className="prose-note">{dev.agentsBody}</p>
          <AgentSetupCard idPrefix="dev-agent" goSection={goSection} />

          <h2 id="installera">{dev.installTitle}</h2>
          <InstallTabs />
          <Code languageLabel={dev.sharedLanguageLabel}>{dev.codeExample}</Code>
          <aside className="developer-notes" aria-labelledby="developer-notes-title">
            <p id="developer-notes-title" className="developer-notes-title">
              {dev.practicalTitle}
            </p>
            <ul>
              {dev.practicalItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a
              className="developer-notes-link"
              href={viewPaths.docsSdk}
              onClick={navClick(() => go("docsSdk"))}
            >
              {dev.practicalDocsCta}
            </a>
          </aside>

          <h2 id="sa-fungerar-det">{dev.diagramTitle}</h2>
          <ArchitectureFigure onCoverage={onCoverage} />

          <nav className="prose-foot foot-links" aria-label={dev.resourcesLabel}>
            <ul>
              <li>
                <a href={NPM_NER} target="_blank" rel="noreferrer">
                  {dev.npmCta}
                </a>
              </li>
              <li>
                <a href={NPM_MCP} target="_blank" rel="noreferrer">
                  {dev.mcpNpmCta}
                </a>
              </li>
              <li>
                <a href={GITHUB} target="_blank" rel="noreferrer">
                  {dev.githubCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={HF_MODEL} target="_blank" rel="noreferrer">
                  {dev.modelCta}
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
