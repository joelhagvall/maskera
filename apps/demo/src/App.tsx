import { useEffect, useState } from "react"
import { Controls } from "./components/Controls"
import { Developers } from "./components/Developers"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { Transparency } from "./components/Transparency"
import { useRoute } from "./routing"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const { view, navigate } = useRoute()
  const ner = useSwedishNer(text)

  // Always land at the top when switching between the demo and the subpages.
  // biome-ignore lint/correctness/useExhaustiveDependencies: view is the trigger
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  function pick(s: Scenario) {
    setActive(s)
    setText(s.text)
  }

  const goDemo = () => navigate("demo")

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
      {view === "dev" && <Developers onBack={goDemo} />}
      {view === "transparency" && (
        <Transparency onBack={goDemo} onDev={() => navigate("dev")} />
      )}
      <Footer onTransparency={() => navigate("transparency")} />
    </div>
  )
}
