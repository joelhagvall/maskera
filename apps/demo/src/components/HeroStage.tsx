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
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  MaskeraMark,
  PencilIcon,
  ToolIcon,
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
 * A neutral coding-agent window (the genre of Codex or T3 Code, no real
 * product's look): a thread list, the run as the tool calls an agent shows
 * and a changed file. The agent calls `maskera_read_file`, which masks the
 * file before the model sees it; the model writes the decision with
 * placeholders through `maskera_write_file`, which restores them locally
 * before the file is written. Those are the real @maskera/mcp tool names and
 * arguments, so the scene is what a user sees in their agent.
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
              <ToolCall name="maskera_read_file" args={[["path", AGENT_FILES.read]]} />
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
              <ToolCall
                name="maskera_write_file"
                args={[
                  ["path", AGENT_FILES.write],
                  ["content", contentPreview(HERO_SCENE.reply)],
                ]}
              />
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
          <p className="agent-reply">{agent.done}</p>
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

/**
 * One tool call as coding agents print it: the tool name and its arguments.
 * Agents list MCP tools by name, so this is the row the user sees. Sans like
 * the rest of the UI: monospace is for code blocks only.
 */
function ToolCall({ name, args }: { name: string; args: [string, string][] }) {
  return (
    <span className="agent-call">
      <ToolIcon size={13} />
      <span className="agent-call-text">
        <span className="agent-call-name">{name}</span>
        <span className="agent-call-args">
          ({args.map(([key, value]) => `${key}: "${value}"`).join(", ")})
        </span>
      </span>
    </span>
  )
}

/** The start of what the model writes, up to its first placeholder, then an ellipsis. */
function contentPreview(text: string): string {
  const cut = text.indexOf("]") + 1
  return cut > 0 && cut < text.length ? `${text.slice(0, cut)} …` : text
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
