import { type KeyboardEvent, useRef, useState } from "react"
import { highlight } from "../highlight"
import copy from "../i18n"
import { CopyButton } from "./CopyButton"

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

/** npm, pnpm, bun and yarn install commands for the maskera package, as tabs. */
export function InstallTabs() {
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
      <pre
        role="tabpanel"
        tabIndex={0}
        id="install-command"
        aria-labelledby={`install-tab-${pm.id}`}
      >
        <code>
          <span className="code-line">{highlight(pm.cmd)}</span>
        </code>
      </pre>
    </div>
  )
}
