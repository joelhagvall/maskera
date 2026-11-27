import { type ReactNode, useState } from "react"
import {
  AGENT_FILES,
  HERO_SCENE,
  HERO_SCENE_WIDTH,
  HERO_STAGES,
  heroScenePath,
  placeholderCount,
  restoreMap,
  type HeroStage as Stage,
} from "../heroScenes"
import { highlight } from "../highlight"
import copy from "../i18n"
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, MaskeraMark, PencilIcon } from "../icons"
import { RedactedText, RestoredText } from "../segments"

/** The npm calls the code scene shows: the package README's redact call, then restore. */
const CODE_LINES = [
  'import { createNerRecognizer, redactWithNer } from "maskera"',
  "",
  "const recognizer = createNerRecognizer()",
  "const { text, restore } = await redactWithNer(input, { recognizer })",
  "",
  "const reply = await yourModel(text)",
  "restore(reply)",
]

/**
 * The hero stage: one task (HERO_SCENE) shown in the browser extension, in an
 * AI agent calling Maskera's MCP tools and in your own code, with the same
 * sentence and the same placeholders. The scenes share one grid cell, so the
 * stage keeps the tallest one's height and never jumps on switch. Only the
 * shown scene reaches assistive tech and the tab order. The stage stays light
 * in both themes, like the extension capture it starts with.
 */
export function HeroStage() {
  const stage = copy.header.stage
  const [index, setIndex] = useState(0)
  const scenes: Record<Stage, ReactNode> = {
    browser: <BrowserScene />,
    agent: <AgentScene />,
    code: <CodeScene />,
  }

  return (
    <figure className="hero-product">
      <figcaption className="hero-scene-bar">
        <div className="tabs" role="group" aria-label={stage.label}>
          {HERO_STAGES.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`tab${i === index ? " on" : ""}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              {stage.tabs[id]}
            </button>
          ))}
        </div>
      </figcaption>
      <div className="hero-stage">
        {HERO_STAGES.map((id, i) => (
          <div
            key={id}
            className={`hero-stage-scene${i === index ? " is-active" : ""}`}
            data-stage={id}
            aria-hidden={i === index ? undefined : true}
            inert={i !== index}
          >
            {scenes[id]}
          </div>
        ))}
      </div>
    </figure>
  )
}

/**
 * The real extension capture (fictional test data) in a plain browser
 * window, with the popup opened from the Maskera toolbar icon over the page's
 * empty right side so it never covers the text.
 */
function BrowserScene() {
  const text = copy.header
  return (
    <div className="hero-window">
      <div className="hero-window-bar" aria-hidden="true">
        <span className="hero-window-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="hero-window-nav">
          <ChevronLeftIcon size={15} />
          <ChevronRightIcon size={15} />
        </span>
        <span className="hero-window-url">
          <LockIcon size={12} />
          {text.productLabel}
        </span>
        <span className="hero-window-ext">
          <MaskeraMark size={15} />
        </span>
      </div>
      <div className="hero-window-page">
        <div className="hero-scenes">
          <img
            className="hero-preview"
            src={heroScenePath(HERO_SCENE.id)}
            width={HERO_SCENE_WIDTH}
            height={HERO_SCENE.height}
            alt={text.stage.browserAlt}
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <img
          className="hero-popup"
          src="/hero/extension-popup.webp"
          width={680}
          height={1128}
          alt={text.productPopupAlt}
          decoding="async"
        />
      </div>
    </div>
  )
}

/**
 * A neutral coding-agent window (the genre of desktop agent apps, no real
 * product's look): a thread list, the run with Maskera as a connector and a
 * changed file. The agent calls `maskera_read_file`, which masks the file
 * before the model sees it; the model writes the decision with placeholders
 * through `maskera_write_file`, which restores them locally before the file
 * is written. Those are the real @maskera/mcp tool names, so the scene is
 * what a user sees in their agent.
 */
function AgentScene() {
  const agent = copy.header.stage.agent
  const map = restoreMap(HERO_SCENE.prompt, HERO_SCENE.masked)
  return (
    <div className="hero-window stage-window">
      <div className="stage-window-bar" aria-hidden="true">
        <span className="hero-window-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="stage-window-title">{agent.windowLabel}</span>
      </div>
      <div className="agent-body">
        <div className="agent-side">
          <p className="agent-new-thread">
            <PencilIcon size={13} />
            {agent.newThread}
          </p>
          <p>{agent.threadsLabel}</p>
          <ul>
            {agent.threads.map((thread, i) => (
              <li key={thread} className={i === 0 ? "is-current" : undefined}>
                {thread}
              </li>
            ))}
          </ul>
        </div>
        <div className="agent-chat">
          <p className="agent-message">{agent.userMessage}</p>
          <ConnectorCall
            tool="maskera_read_file"
            status={agent.maskedCount.replace(
              "{count}",
              String(placeholderCount(HERO_SCENE.masked)),
            )}
          >
            <p className="agent-connector-label">{agent.request}</p>
            <dl className="agent-connector-args">
              <dt>path</dt>
              <dd>{AGENT_FILES.read}</dd>
            </dl>
            <p className="agent-connector-label">{agent.modelSees}</p>
            <p className="agent-connector-result">
              <RedactedText text={HERO_SCENE.masked} />
            </p>
          </ConnectorCall>
          <p className="agent-reply">{agent.plan}</p>
          <ConnectorCall tool="maskera_write_file" status={agent.writeRestored} />
          <div className="agent-diff">
            <p className="agent-diff-head">{AGENT_FILES.write}</p>
            <p className="agent-diff-line">
              <span className="agent-diff-gutter" aria-hidden="true">
                +
              </span>
              <span>
                <RestoredText text={HERO_SCENE.reply} map={map} />
              </span>
            </p>
          </div>
          <p className="agent-reply">{agent.done}</p>
          <div className="agent-composer" aria-hidden="true">
            <span>{agent.composer}</span>
            <span className="agent-composer-bar">
              <span className="agent-connector-chip">
                <ConnectorLogo />
                maskera
              </span>
              <span className="agent-composer-send">↑</span>
            </span>
          </div>
        </div>
      </div>
      <p className="stage-window-foot">
        <span>{agent.worksWith}</span>
        <span>{agent.restoredNote}</span>
      </p>
    </div>
  )
}

/** Maskera's mark on the dark tile agents show next to a connector's name. */
function ConnectorLogo() {
  return (
    <span className="agent-connector-logo">
      <MaskeraMark size={13} />
    </span>
  )
}

/**
 * One MCP tool call as desktop agents show a connector: the connector's logo
 * and name, the tool's real @maskera/mcp name, a status and a chevron. With
 * children it is shown open, with the request and what the model got.
 */
function ConnectorCall({
  tool,
  status,
  children,
}: {
  tool: string
  status: string
  children?: ReactNode
}) {
  return (
    <div className="agent-connector">
      <p className="agent-connector-head">
        <ConnectorLogo />
        <span className="agent-connector-title">
          <strong>maskera</strong> <span className="agent-call-name">{tool}</span>
        </span>
        <span className="agent-connector-status">{status}</span>
        <ChevronRightIcon size={13} className={children ? "is-open" : undefined} />
      </p>
      {children && <div className="agent-connector-body">{children}</div>}
    </div>
  )
}

/** The npm package in your own code: the calls, what the model gets, and the reply restored. */
function CodeScene() {
  const code = copy.header.stage.code
  const map = restoreMap(HERO_SCENE.prompt, HERO_SCENE.masked)
  return (
    <div className="hero-window stage-window">
      <div className="stage-window-bar" aria-hidden="true">
        <span className="hero-window-dots">
          <span />
          <span />
          <span />
        </span>
        <span className="stage-window-title">{code.fileLabel}</span>
      </div>
      <div className="hero-code">
        <pre>
          <code>
            {CODE_LINES.map((line, i) => (
              <span key={`${i}-${line}`} className="code-line">
                {highlight(line)}
              </span>
            ))}
          </code>
        </pre>
        <div className="hero-code-output">
          <p className="agent-tool-label">{code.outputLabel}</p>
          <p className="hero-code-text">
            <RedactedText text={HERO_SCENE.masked} />
          </p>
          <p className="agent-tool-label">{code.restoredLabel}</p>
          <p className="hero-code-text">
            <RestoredText text={HERO_SCENE.reply} map={map} />
          </p>
        </div>
      </div>
      <p className="stage-window-foot">
        <span>{code.note}</span>
      </p>
    </div>
  )
}
