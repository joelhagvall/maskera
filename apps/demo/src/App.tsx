import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Accuracy } from "./components/Accuracy"
import { Controls } from "./components/Controls"
import { Developers } from "./components/Developers"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { PrivacyPolicy } from "./components/PrivacyPolicy"
import { RestoreDemo } from "./components/RestoreDemo"
import { Security } from "./components/Security"
import { Services } from "./components/Services"
import { TestData } from "./components/TestData"
import { Transparency } from "./components/Transparency"
import { invalidPersonnummer } from "./hints"
import copy from "./i18n"
import { navClick, useRoute, type View, viewPaths } from "./routing"
import { getScenarios, type Scenario } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

// initialView is the build-time prerender's route (entry-server.tsx); the
// browser leaves it undefined and derives the view from the URL as before.
export function App({ initialView }: { initialView?: View }) {
  const scenarios = getScenarios()
  const [activeId, setActiveId] = useState(scenarios[0].id)
  const active = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0]
  const [text, setText] = useState<string>(scenarios[0].text)
  const [anchor, setAnchor] = useState<string | null>(null)
  // The output card's "Visa återställningsnyckeln" toggle lives here so it
  // survives scenario switches instead of collapsing.
  const [mapOpen, setMapOpen] = useState(false)
  const { view, navigate } = useRoute(initialView)
  // The demo autoloads the model on first entry, as before. Direct landings on
  // content pages stay at zero and therefore never create the worker or fetch
  // its weights. Incrementing gives the error UI a real retry path.
  const [modelActivation, setModelActivation] = useState(() => (view === "demo" ? 1 : 0))
  // The analysis pipeline runs on a deferred copy of the text: on a large
  // paste or fast typing, the textarea and its backdrop (the visible text)
  // commit at urgent priority, while the rule pass and the result cards
  // re-render at deferred priority. Only the highlight marks can lag a frame,
  // never the text itself, since InputCard weaves the synchronous text.
  const deferredText = useDeferredValue(text)
  const ner = useSwedishNer(deferredText, modelActivation)
  const invalidPnrs = useMemo(
    () => invalidPersonnummer(deferredText, ner.result.redactions),
    [deferredText, ner.result.redactions],
  )

  // Also autoload when the visitor enters the demo from a content page or via
  // browser history, without making content-only landings pay for the model.
  useEffect(() => {
    if (view === "demo") startModel()
  }, [view])

  // Jump to the requested section (e.g. the footer's "Integritetspolicy"
  // link) as soon as it is set, not on view change: navigate() is a no-op
  // when the target view is already active, and the jump must work then too.
  // Consuming the anchor right away keeps it from leaking into a later
  // navigation and skipping that page's scroll-to-top.
  useEffect(() => {
    if (!anchor) return
    document.getElementById(anchor)?.scrollIntoView()
    setAnchor(null)
  }, [anchor])

  function pick(s: Scenario) {
    setActiveId(s.id)
    setText(s.text)
  }

  function startModel() {
    setModelActivation((current) => (current === 0 ? 1 : current))
  }

  function retryModel() {
    setModelActivation((current) => current + 1)
  }

  function changeText(next: string) {
    setText(next)
  }

  // One navigation handler for the TopBar and sub-pages; entering the demo
  // also warms the model, like before.
  const go = (next: View) => {
    if (next === "demo") startModel()
    navigate(next)
  }
  const goCoverage = () => {
    setAnchor("vad-maskeras")
    navigate("transparency", { skipScrollRestoration: true })
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        {copy.demo.skipLink}
      </a>
      {view === "demo" && (
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
                onChange={changeText}
              />
              {/* The restore-key toggle state lives in App: it survives
                  scenario switches instead of collapsing. */}
              <OutputCard
                result={ner.result}
                analyzing={ner.analyzing}
                invalidPnrs={invalidPnrs}
                showMap={mapOpen}
                onToggleMap={() => setMapOpen((v) => !v)}
              />
            </div>
            {/* Right under the cards, and only for the preset examples: the
                raw-looking values in "Din text" are the reason the note
                exists, and it has nothing to say about the user's own text. */}
            {active.id !== "fritext" && (
              <p className="exnote">
                {copy.demo.testDataNote}{" "}
                <a href={viewPaths.testdata} onClick={navClick(() => navigate("testdata"))}>
                  {copy.demo.testDataCta}
                </a>
                .
              </p>
            )}
            {/* Step three: paste the AI's answer back and un-mask it locally.
                Only shown once there is something to restore. key resets the
                edited draft when the scenario changes. */}
            {Object.keys(ner.result.map).length > 0 && (
              <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
            )}
          </main>
        </>
      )}
      {view === "dev" && <Developers go={go} onCoverage={goCoverage} />}
      {view === "transparency" && <Transparency go={go} />}
      {view === "testdata" && <TestData go={go} />}
      {view === "privacy" && <PrivacyPolicy go={go} />}
      {view === "services" && <Services go={go} onCoverage={goCoverage} />}
      {view === "accuracy" && <Accuracy go={go} />}
      {view === "security" && <Security go={go} />}
      <Footer
        onTransparency={() => navigate("transparency")}
        onTestData={() => navigate("testdata")}
        onPolicy={() => navigate("privacy")}
        onAccuracy={() => navigate("accuracy")}
        onSecurity={() => navigate("security")}
      />
    </div>
  )
}
