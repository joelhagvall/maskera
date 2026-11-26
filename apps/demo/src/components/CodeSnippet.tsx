import { highlight } from "../highlight"
import copy from "../i18n"
import { CopyButton } from "./CopyButton"

/** A static, highlighted snippet with a language label and a copy button. */
export function Code({ children, languageLabel }: { children: string; languageLabel: string }) {
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
    <div className="code-block snippet-code">
      <div className="code-head">
        <span className="shared-language-label">{languageLabel}</span>
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
