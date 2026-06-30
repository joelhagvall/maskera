import { GITHUB } from "../constants"

export function Header() {
  return (
    <header className="header">
      <div className="head-row">
        <span className="wordmark">maska</span>
        <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>
      <h1 className="title">Maska personuppgifter innan AI:n ser dem.</h1>
      <p className="lede">
        Körs helt lokalt i webbläsaren — ingen text lämnar din enhet. Regler fångar det
        strukturerade (personnummer, org-nr…), en svensk modell fångar namn och platser.
      </p>
    </header>
  )
}
