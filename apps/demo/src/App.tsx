import { Suspense, useEffect, useMemo, useState } from "react"
import { Controls } from "./components/Controls"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { RestoreDemo } from "./components/RestoreDemo"
import { invalidPersonnummer } from "./hints"
import { Developers, prefetchPagesWhenIdle, Services, Transparency } from "./pages"
import { useRoute } from "./routing"
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

  return (
    <div className="app">
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
            {/* Step three: paste the AI's answer back and un-mask it locally.
                Only shown once there is something to restore. key resets the
                edited draft when the scenario changes. */}
            {Object.keys(ner.result.map).length > 0 && (
              <RestoreDemo key={active.id} result={ner.result} scenarioId={active.id} />
            )}
          </main>
        </>
      )}
      {view === "dev" && (
        <Suspense fallback={null}>
          <Developers onBack={goDemo} onServices={() => navigate("services")} />
        </Suspense>
      )}
      {view === "transparency" && (
        <Suspense fallback={null}>
          <Transparency
            onBack={goDemo}
            onDev={() => navigate("dev")}
            onServices={() => navigate("services")}
          />
        </Suspense>
      )}
      {view === "services" && (
        <Suspense fallback={null}>
          <Services onBack={goDemo} onDev={() => navigate("dev")} />
        </Suspense>
      )}
      <Footer
        onTransparency={() => navigate("transparency")}
        onPolicy={goPolicy}
        onServices={() => navigate("services")}
      />
    </div>
  )
}
