import { Suspense, useEffect, useMemo, useState } from "react"
import { Controls } from "./components/Controls"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { RestoreDemo } from "./components/RestoreDemo"
import { invalidPersonnummer } from "./hints"
import { Developers, prefetchPagesWhenIdle, Services, Transparency } from "./pages"
import { navClick, useRoute, viewPaths } from "./routing"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [anchor, setAnchor] = useState<string | null>(null)
  const { view, navigate } = useRoute()
  const ner = useSwedishNer(text)
  const invalidPnrs = useMemo(
    () => invalidPersonnummer(text, ner.result.redactions),
    [text, ner.result.redactions],
  )

  // Warm the code-split sub-pages after first paint so the first "För
  // utvecklare" / transparency navigation is instant, even on touch where
  // there is no hover or focus to trigger the per-link preload.
  useEffect(() => {
    prefetchPagesWhenIdle()
  }, [])

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

  const goDemo = () => navigate("demo")
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
      {/* One persistent Suspense boundary around the whole view switch. React
          only keeps the current page on screen during a suspended transition
          for boundaries that already exist — a per-view boundary is brand new
          on every navigation, so its null fallback would commit immediately
          and blank-flash the page while a sub-page chunk loads (first visit,
          fresh cache). */}
      <Suspense fallback={null}>
        {view === "demo" && (
          <>
            <Header onDev={() => navigate("dev")} onServices={() => navigate("services")} />
            <main>
              <Controls
                activeId={active.id}
                onPick={pick}
                status={ner.status}
                progress={ner.progress}
                analyzing={ner.analyzing}
              />
              <div className="grid">
                <InputCard
                  tagline={active.tagline}
                  text={text}
                  redactions={ner.result.redactions}
                  onChange={setText}
                />
                {/* key resets the card's local protect/showMap state per scenario */}
                <OutputCard
                  key={active.id}
                  result={ner.result}
                  analyzing={ner.analyzing}
                  invalidPnrs={invalidPnrs}
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
                <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
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
      </Suspense>
      <Footer
        onTransparency={() => navigate("transparency")}
        onPolicy={goPolicy}
        onServices={() => navigate("services")}
      />
    </div>
  )
}
