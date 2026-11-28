import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import { DEMO_ANCHOR } from "../constants"
import { invalidPersonnummer } from "../hints"
import copy, { activeLocale } from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { getScenarios, type Scenario } from "../scenarios"
import { useSwedishNer } from "../useSwedishNer"
import { useWhenNear } from "../useWhenNear"
import { Controls } from "./Controls"
import { Header } from "./Header"
import { HomeClosing, HomeProof, HomeTracks, HomeTrust } from "./HomeTracks"
import { InputCard } from "./InputCard"
import { OutputCard } from "./OutputCard"
import { RestoreDemo } from "./RestoreDemo"

export interface DemoWorkspaceProps {
  go: (next: View) => void
  goSection: (next: View, anchor: string) => void
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
  goSection,
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
  // 0 until the visitor heads for the demo: the model (about 40 MB) is only
  // fetched when the demo comes near the viewport or is used.
  const [modelActivation, setModelActivation] = useState(0)
  const activateModel = useCallback(
    () => setModelActivation((current) => (current === 0 ? 1 : current)),
    [],
  )
  const demoRef = useWhenNear(activateModel, "600px 0px")

  const deferredText = useDeferredValue(text)
  // Every example text is analyzed in the background once the model is ready,
  // so picking an example shows the model's placeholders at once.
  const exampleTexts = useMemo(
    () => scenarios.map((scenario) => scenario.text).filter(Boolean),
    [scenarios],
  )
  const ner = useSwedishNer(deferredText, modelActivation, exampleTexts)
  const invalidPnrs = useMemo(
    () => invalidPersonnummer(deferredText, ner.result.redactions),
    [deferredText, ner.result.redactions],
  )

  // The restore section shows when there is something to restore. While the
  // model is still answering for a new text, keep the last settled visibility:
  // the interim rules-only result can be empty (Svensk kontext has only names
  // the model finds), and hiding the section for that moment makes the page
  // jump. Settled visibility is updated during render, not in an effect.
  const hasRestore = Object.keys(ner.result.map).length > 0
  const [restoreSettled, setRestoreSettled] = useState(hasRestore)
  if (!ner.pending && restoreSettled !== hasRestore) setRestoreSettled(hasRestore)
  const showRestore = hasRestore || (ner.pending && restoreSettled)

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
    activateModel()
  }

  function edit(next: string) {
    setText(next)
    activateModel()
  }

  function retryModel() {
    setModelActivation((current) => current + 1)
  }

  return (
    <>
      <Header go={go} goSection={goSection} />
      <main id="main-content">
        <HomeProof go={go} />
        <HomeTracks goSection={goSection} />
        <div className="home-try-head" ref={demoRef}>
          <h2 id={DEMO_ANCHOR}>{copy.demo.tryTitle}</h2>
          {/* The examples are Swedish; say why where English readers meet them. */}
          {activeLocale === "en" ? <p>{copy.demo.languageNote}</p> : null}
        </div>
        <Controls
          activeId={activeId}
          onPick={pick}
          status={ner.status}
          progress={ner.progress}
          analyzing={ner.analyzing}
          onRetryModel={retryModel}
        />
        <ol className="try-steps">
          <InputCard
            tagline={active.tagline}
            text={text}
            redactions={ner.result.redactions}
            onChange={edit}
          />
          <OutputCard
            result={ner.result}
            analyzing={ner.analyzing}
            invalidPnrs={invalidPnrs}
            showMap={mapOpen}
            onToggleMap={() => setMapOpen((v) => !v)}
            onCoverage={onCoverage}
          />
          {showRestore && (
            <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
          )}
        </ol>
        <p className="exnote">
          {copy.demo.testDataNote}{" "}
          <a href={viewPaths.testdata} onClick={navClick(() => go("testdata"))}>
            {copy.demo.testDataCta}
          </a>
        </p>
        <HomeTrust go={go} />
        <HomeClosing go={go} goSection={goSection} />
      </main>
    </>
  )
}
