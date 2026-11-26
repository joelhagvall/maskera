import { type KeyboardEvent, useRef, useState } from "react"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { CopyButton } from "./CopyButton"

export type AgentModeId = "proxy" | "mcp" | "guard"

export function AgentSetupCard({ idPrefix = "agent" }: { idPrefix?: string }) {
  const agent = copy.agentSetup
  const modes = agent.modes
  const [activeId, setActiveId] = useState<AgentModeId>("proxy")
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const active = modes.find((m) => m.id === activeId) ?? modes[0]
  const copyCommand = active.code
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === "ArrowRight") nextIndex = (index + 1) % modes.length
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + modes.length) % modes.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = modes.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = modes[nextIndex]
    if (!next) return
    setActiveId(next.id as AgentModeId)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="agent-setup">
      <div className="agent-prompt-card">
        <div className="agent-prompt-head">
          <div>
            <h3 className="agent-prompt-title">{agent.promptTitle}</h3>
            <p className="agent-prompt-desc">{agent.promptDescription}</p>
          </div>
          <div className="agent-prompt-actions">
            <CopyButton
              text={agent.promptText}
              className="agent-prompt-copy"
              iconSize={14}
              label={agent.copyPromptCta}
              copiedLabel={agent.copiedPromptCta}
              ariaLabel={agent.copyPromptCta}
            />
            <a className="agent-llms-link" href="/llms.txt" target="_blank" rel="noreferrer">
              {agent.llmsLinkCta}
              <ArrowUpRightIcon size={12} />
            </a>
          </div>
        </div>
        <blockquote className="agent-prompt-quote">{agent.promptText}</blockquote>
        <div className="agent-skill-row">
          <span className="agent-skill-label">{agent.skillLabel}</span>
          <code className="agent-skill-cmd">{agent.skillCommand}</code>
          <CopyButton
            text={agent.skillCommand}
            className="code-copy"
            iconSize={13}
            ariaLabel={copy.copyButton.copyCode}
            title={copy.copyButton.copy}
          />
        </div>
      </div>

      <div className="code-block install-tabs agent-modes-block">
        <div className="code-head">
          <div className="code-tabs" role="tablist" aria-label={agent.modesLabel}>
            {modes.map((mode, index) => {
              const selected = mode.id === active.id
              return (
                <button
                  key={mode.id}
                  ref={(el) => {
                    tabRefs.current[index] = el
                  }}
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${mode.id}`}
                  aria-selected={selected}
                  aria-controls={`${idPrefix}-panel-${mode.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`code-tab${selected ? " on" : ""}`}
                  onClick={() => setActiveId(mode.id as AgentModeId)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                >
                  {mode.label}
                </button>
              )
            })}
          </div>
          <CopyButton
            text={copyCommand || active.code}
            className="code-copy"
            iconSize={14}
            ariaLabel={copy.copyButton.copyCode}
            title={copy.copyButton.copy}
          />
        </div>
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-${active.id}`}
          aria-labelledby={`${idPrefix}-tab-${active.id}`}
        >
          <p className="agent-mode-summary">{active.summary}</p>
          <pre>
            <code>
              {active.code.split("\n").map((line, i) => (
                <span key={i} className="code-line">
                  {line}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  )
}
