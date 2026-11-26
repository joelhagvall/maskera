import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { invalidPersonnummer } from "../hints"
import copy from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { getScenarios, type Scenario } from "../scenarios"
import { useSwedishNer } from "../useSwedishNer"
import { Controls } from "./Controls"
import { ExtensionInstall } from "./ExtensionInstall"
import { Header } from "./Header"
import { InputCard } from "./InputCard"
import { OutputCard } from "./OutputCard"
import { RestoreDemo } from "./RestoreDemo"

export interface DemoWorkspaceProps {
  go: (next: View) => void
  onCoverage: () => void
  requestedScenarioId: string | null
  onRequestedScenarioConsumed: () => void
}

/**
 * Interactive local-masking demo view, code-split into its own chunk so
 * content pages (/tjanster, /traffsakerhet, /utvecklare, etc.) never download
 * the rules engine or NER worker glue unless the visitor enters the demo.
 */
export function DemoWorkspace({
  go,
  onCoverage,
  requestedScenarioId,
  onRequestedScenarioConsumed,
}: DemoWorkspaceProps) {
  const scenarios = getScenarios()
  const [activeId, setActiveId] = useState(() => {
    if (requestedScenarioId && scenarios.some((s) => s.id === requestedScenarioId)) {
      return requestedScenarioId
    }
    return scenarios[0].id
  })
  const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0]
  const [text, setText] = useState<string>(active.text)
  const [mapOpen, setMapOpen] = useState(false)
  const [modelActivation, setModelActivation] = useState(1)

  const deferredText = useDeferredValue(text)
  const ner = useSwedishNer(deferredText, modelActivation)
  const invalidPnrs = useMemo(
    () => invalidPersonnummer(deferredText, ner.result.redactions),
    [deferredText, ner.result.redactions],
  )

  useEffect(() => {
    if (!requestedScenarioId) return
    const target = scenarios.find((scenario) => scenario.id === requestedScenarioId)
    if (target) {
      setActiveId(target.id)
      setText(target.text)
    }
    onRequestedScenarioConsumed()
  }, [requestedScenarioId, scenarios, onRequestedScenarioConsumed])

  function pick(s: Scenario) {
    setActiveId(s.id)
    setText(s.text)
  }

  function retryModel() {
    setModelActivation((current) => current + 1)
  }

  return (
    <>
      <Header go={go} />
      <main id="main-content">
        <Controls
          activeId={activeId}
          onPick={pick}
          status={ner.status}
          progress={ner.progress}
          analyzing={ner.analyzing}
          onRetryModel={retryModel}
        />
        <div className="grid">
          <InputCard
            tagline={active.tagline}
            text={text}
            redactions={ner.result.redactions}
            onChange={setText}
          />
          <OutputCard
            result={ner.result}
            analyzing={ner.analyzing}
            invalidPnrs={invalidPnrs}
            showMap={mapOpen}
            onToggleMap={() => setMapOpen((v) => !v)}
            onCoverage={onCoverage}
          />
        </div>
        {active.id !== "fritext" && (
          <p className="exnote">
            {copy.demo.testDataNote}{" "}
            <a href={viewPaths.testdata} onClick={navClick(() => go("testdata"))}>
              {copy.demo.testDataCta}
            </a>
            .
          </p>
        )}
        {Object.keys(ner.result.map).length > 0 && (
          <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
        )}
        <ExtensionInstall trialContent="demo_extension_trial" />
      </main>
    </>
  )
}
