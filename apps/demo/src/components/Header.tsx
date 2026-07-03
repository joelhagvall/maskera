import { GITHUB } from "../constants"
import { ArrowUpRightIcon, MaskeraMark } from "../icons"

export function Header() {
  return (
    <header className="header">
      <div className="head-row">
        <span className="wordmark">
          <MaskeraMark size={20} />
          maskera
        </span>
        <nav className="head-links">
          <a className="ghlink" href={`${GITHUB}#readme`} target="_blank" rel="noreferrer">
            Docs
            <ArrowUpRightIcon size={13} />
          </a>
          <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRightIcon size={13} />
          </a>
        </nav>
      </div>
      <h1 className="title">Maskera personuppgifter innan AI:n ser dem.</h1>
      <p className="lede">
        maskera hittar och döljer personuppgifter, som namn, personnummer och adresser, innan texten
        skickas till ChatGPT eller andra AI-tjänster. Allt sker{" "}
        <strong>direkt i din webbläsare</strong>, ingenting lämnar din dator. För utvecklare: allt
        är öppen källkod och finns som npm-paket, redo att droppa in i din app.
      </p>
    </header>
  )
}
