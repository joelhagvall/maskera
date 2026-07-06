import { Suspense, useEffect, useState } from "react"
import { Controls } from "./components/Controls"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { Developers, Transparency } from "./pages"
import { useRoute } from "./routing"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const [anchor, setAnchor] = useState<string | null>(null)
  const { view, navigate } = useRoute()
  const ner = useSwedishNer(text)

  // On a view switch, jump to the requested section if one was set (e.g. the
  // footer's "Integritetspolicy" link), otherwise land at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view is the trigger
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
          <Header onDev={() => navigate("dev")} />
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
              <OutputCard key={active.id} result={ner.result} analyzing={ner.analyzing} />
            </div>
          </main>
        </>
      )}
      {view === "dev" && (
        <Suspense fallback={null}>
          <Developers onBack={goDemo} />
        </Suspense>
      )}
      {view === "transparency" && (
        <Suspense fallback={null}>
          <Transparency onBack={goDemo} onDev={() => navigate("dev")} />
        </Suspense>
      )}
      <Footer onTransparency={() => navigate("transparency")} onPolicy={goPolicy} />
    </div>
  )
}
