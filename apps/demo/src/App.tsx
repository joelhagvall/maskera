import { useEffect, useMemo, useState } from "react"
import { Controls } from "./components/Controls"
import { Developers } from "./components/Developers"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { RestoreDemo } from "./components/RestoreDemo"
import { Services } from "./components/Services"
import { Transparency } from "./components/Transparency"
import { invalidPersonnummer } from "./hints"
import { navClick, useRoute, viewPaths } from "./routing"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [anchor, setAnchor] = useState<string | null>(null)
  // "Se hela flödet" expanded state lives here, NOT in RestoreDemo: that
  // component is keyed per scenario (to reset the edited draft), and a local
  // open state would collapse the flow on every scenario switch. Same story
  // for the output card's "Visa återställningsnyckel" toggle.
  const [flowOpen, setFlowOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const { view, navigate } = useRoute()
  // The demo autoloads the model on first entry, as before. Direct landings on
  // content pages stay at zero and therefore never create the worker or fetch
  // its weights. Incrementing gives the error UI a real retry path.
  const [modelActivation, setModelActivation] = useState(() => (view === "demo" ? 1 : 0))
  const ner = useSwedishNer(text, modelActivation)
  const invalidPnrs = useMemo(
    () => invalidPersonnummer(text, ner.result.redactions),
    [text, ner.result.redactions],
  )

  // Also autoload when the visitor enters the demo from a content page or via
  // browser history, without making content-only landings pay for the model.
  useEffect(() => {
    if (view === "demo") startModel()
  }, [view])

  // On a view switch, jump to the requested section if one was set (e.g. the
  // footer's "Integritetspolicy" link), otherwise land at the top.
  useEffect(() => {
    if (anchor) {
      document.getElementById(anchor)?.scrollIntoView()
      setAnchor(null)
    } else {
      window.scrollTo(0, 0)
    }
  }, [view])

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

  const goDemo = () => {
    startModel()
    navigate("demo")
  }
  const goPolicy = () => {
    setAnchor("integritetspolicy")
    navigate("transparency")
  }
  const goTestdata = () => {
    setAnchor("testdata")
    navigate("transparency")
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Hoppa till huvudinnehållet
      </a>
      {view === "demo" && (
        <>
          <Header onDev={() => navigate("dev")} onServices={() => navigate("services")} />
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
              {/* The restore-key toggle state lives in App (like flowOpen):
                  it survives scenario switches instead of collapsing. */}
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
              <RestoreDemo
                key={active.id}
                result={ner.result}
                scenarioId={active.id}
                open={flowOpen}
                onToggleOpen={() => setFlowOpen((v) => !v)}
              />
            )}
          </main>
        </>
      )}
      {view === "dev" && <Developers onBack={goDemo} onServices={() => navigate("services")} />}
      {view === "transparency" && (
        <Transparency
          onBack={goDemo}
          onDev={() => navigate("dev")}
          onServices={() => navigate("services")}
        />
      )}
      {view === "services" && <Services onBack={goDemo} onDev={() => navigate("dev")} />}
      <Footer
        onTransparency={() => navigate("transparency")}
        onPolicy={goPolicy}
        onServices={() => navigate("services")}
      />
    </div>
  )
}
