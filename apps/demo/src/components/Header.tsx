import type { View } from "../routing"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
      <h1 className="title">Skydda personuppgifter innan texten skickas till AI.</h1>
      <p className="lede">
        maskera hittar och ersätter upptäckta personuppgifter, som namn, personnummer och adresser,
        innan texten skickas till ChatGPT eller andra AI-tjänster. Automatisk maskering kan missa
        uppgifter i löpande text. Texten och återställningsnyckeln behandlas{" "}
        <strong>direkt i din webbläsare</strong> och skickas inte för maskering. För utvecklare:
        öppen källkod, finns som npm-paket.
      </p>
    </header>
  )
}
