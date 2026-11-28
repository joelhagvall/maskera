import copy from "../i18n"
import { AgentLogoStack, ArrowUpRightIcon } from "../icons"
import { CopyButton } from "./CopyButton"

/**
 * One-row callout that copies the agent setup prompt and links to llms.txt.
 * Uses a <p> title so it fits above the first <h2> on a docs page without
 * breaking heading order.
 */
export function AgentPromptCard() {
  const agent = copy.agentSetup
  return (
    <div className="agent-prompt-card">
      <div className="agent-prompt-head">
        <p className="agent-prompt-title">{agent.promptTitle}</p>
        <div className="agent-prompt-actions">
          <CopyButton
            text={agent.promptText}
            className="agent-prompt-copy"
            iconSize={14}
            iconPosition="end"
            leading={<AgentLogoStack />}
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
    </div>
  )
}
