import type { View } from "../routing"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
      <h1 className="title">Skydda personuppgifter innan texten skickas till AI.</h1>
      <p className="lede">
        maskera hittar och döljer personuppgifter, som namn, personnummer och adresser, innan texten
        skickas till ChatGPT eller andra AI-tjänster. Allt sker{" "}
        <strong>direkt i din webbläsare</strong>, ingenting lämnar din enhet. För utvecklare: öppen
        källkod, finns som npm-paket.
      </p>
    </header>
  )
}
