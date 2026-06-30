import { GITHUB } from "../constants"
import { ArrowUpRightIcon } from "../icons"

export function Header() {
  return (
    <header className="header">
      <div className="head-row">
        <span className="wordmark">maska</span>
        <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
          GitHub
          <ArrowUpRightIcon size={13} />
        </a>
      </div>
      <h1 className="title">Maska personuppgifter innan AI:n ser dem.</h1>
      <p className="lede">
        maska hittar och döljer personuppgifter — namn, personnummer, adresser — innan texten
        skickas till en AI-tjänst som ChatGPT, en logg eller ett analysverktyg. Smarta regler och en
        liten svensk AI-modell gör jobbet <strong>helt i din webbläsare</strong> — ingenting lämnar
        din dator.
      </p>
    </header>
  )
}
