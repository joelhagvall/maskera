import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { Accuracy } from "./components/Accuracy"
import { Controls } from "./components/Controls"
import { Developers } from "./components/Developers"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { RestoreDemo } from "./components/RestoreDemo"
import { Security } from "./components/Security"
import { Services } from "./components/Services"
import { Transparency } from "./components/Transparency"
import { invalidPersonnummer } from "./hints"
import { navClick, useRoute, type View, viewPaths } from "./routing"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [anchor, setAnchor] = useState<string | null>(null)
  // The output card's "Visa återställningsnyckel" toggle lives here so it
  // survives scenario switches instead of collapsing.
  const [mapOpen, setMapOpen] = useState(false)
  const { view, navigate } = useRoute()
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

  // On a view switch, land at the top, unless a section jump is pending.
  useEffect(() => {
    if (!anchor) window.scrollTo(0, 0)
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
    setActive(s)
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
  const goPolicy = () => {
    setAnchor("integritetspolicy")
    navigate("transparency")
  }
  const goTestdata = () => {
    setAnchor("testdata")
    navigate("transparency")
  }
  const goCoverage = () => {
    setAnchor("vad-maskeras")
    navigate("transparency")
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Hoppa till huvudinnehållet
      </a>
      {view === "demo" && (
        <>
          <Header go={go} />
          <main id="main-content">
            <Controls
              activeId={active.id}
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
                Personerna i exemplen är påhittade. Personnummer, telefonnummer och kontouppgifter
                är officiellt reserverade testvärden, aldrig en verklig persons uppgifter.{" "}
                <a href={viewPaths.transparency} onClick={navClick(goTestdata)}>
                  Läs mer om testdatan
                </a>
                .
              </p>
            )}
            {/* Step three: paste the AI's answer back and un-mask it locally.
                Only shown once there is something to restore. key resets the
                edited draft when the scenario changes. */}
            {Object.keys(ner.result.map).length > 0 && (
              <>
                <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
                {/* Right after the full mask-send-restore loop has proven
                    itself: that is when "can we run this in production?"
                    gets asked. Conditional on a result so it stays out of
                    the way until then; the footer keeps the generic pointer.
                    The services page owns the app.maskera.dev links. */}
                <p className="exnote">
                  Samma maskering finns som Maskera Gateway, en färdig installation för era egna
                  servrar.{" "}
                  <a href={viewPaths.services} onClick={navClick(() => navigate("services"))}>
                    Se Maskera för företag
                  </a>
                  .
                </p>
              </>
            )}
          </main>
        </>
      )}
      {view === "dev" && <Developers go={go} onCoverage={goCoverage} />}
      {view === "transparency" && <Transparency go={go} />}
      {view === "services" && <Services go={go} onCoverage={goCoverage} />}
      {view === "accuracy" && <Accuracy go={go} />}
      {view === "security" && <Security go={go} />}
      <Footer
        showServices={view !== "demo"}
        onTransparency={() => navigate("transparency")}
        onPolicy={goPolicy}
        onServices={() => navigate("services")}
        onAccuracy={() => navigate("accuracy")}
        onSecurity={() => navigate("security")}
      />
    </div>
  )
}
