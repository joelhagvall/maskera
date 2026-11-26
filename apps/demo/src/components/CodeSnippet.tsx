import { highlight } from "../highlight"
import copy from "../i18n"
import { CopyButton } from "./CopyButton"

export type CodeLanguage = "ts" | "js"

/** A static, highlighted snippet with a copy button and an optional language switch. */
export function Code({
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
