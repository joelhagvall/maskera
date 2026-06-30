import { useState } from "react"
import { Controls } from "./components/Controls"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { InputCard } from "./components/InputCard"
import { OutputCard } from "./components/OutputCard"
import { type Scenario, scenarios } from "./scenarios"
import { useSwedishNer } from "./useSwedishNer"

export function App() {
  const [active, setActive] = useState<Scenario>(scenarios[0])
  const [text, setText] = useState<string>(scenarios[0].text)
  const ner = useSwedishNer(text)

  function pick(s: Scenario) {
    setActive(s)
    setText(s.text)
  }

  return (
    <div className="app">
      <Header />
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
        <OutputCard key={active.id} result={ner.result} original={text} />
      </div>
      <Footer />
    </div>
  )
}
