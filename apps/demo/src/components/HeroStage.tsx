import { type ReactNode, useState } from "react"
import {
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
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  LockIcon,
  MaskeraMark,
  PencilIcon,
} from "../icons"
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
 * AI agent behind the local proxy and in your own code, with the same
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
 * A neutral coding-agent window (the genre of Codex or T3 Code, no real
 * product's look): a thread list, the run as compact tool rows and a changed
 * file. The agent reads a file and the local proxy masks the tool result
 * before the model sees it; the model writes the decision with placeholders
 * and the proxy restores them in the tool call before the file is written.
 * That is the proxy mode end to end.
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
          <div className="agent-step">
            <p className="agent-step-head">
              <span>
                <EyeIcon size={13} />
                {agent.toolRead}
              </span>
              <span>
                {agent.maskedCount.replace("{count}", String(placeholderCount(HERO_SCENE.masked)))}
              </span>
            </p>
            <p className="agent-step-body">
              <span className="agent-tool-label">{agent.modelSees}</span>{" "}
              <RedactedText text={HERO_SCENE.masked} />
            </p>
          </div>
          <p className="agent-reply">{agent.plan}</p>
          <div className="agent-diff">
            <p className="agent-diff-head">
              <span>{agent.edited}</span>
              <span className="agent-diff-stat">+1</span>
              <span className="agent-diff-note">{agent.writeRestored}</span>
            </p>
            <p className="agent-diff-line">
              <span className="agent-diff-gutter" aria-hidden="true">
                +
              </span>
              <span>
                <RestoredText text={HERO_SCENE.reply} map={map} />
              </span>
            </p>
          </div>
          <p className="agent-reply">
            <CheckIcon size={13} />
            {agent.done}
          </p>
          <div className="agent-composer" aria-hidden="true">
            <span>{agent.composer}</span>
            <span className="agent-composer-bar">
              <span>{agent.composerMeta}</span>
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
