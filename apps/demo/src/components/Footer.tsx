import { GITHUB, HF_MODEL } from "../constants"

export function Footer({ onTransparency }: { onTransparency: () => void }) {
  return (
    <footer className="footer">
      <p className="footer-row">
        Byggd på <code>@maskera/core</code> och{" "}
        <a href={HF_MODEL} target="_blank" rel="noreferrer">
          en egentränad svensk AI-modell
        </a>
        , båda körs i webbläsaren. Ingen data skickas någonstans.{" "}
        <button type="button" className="footer-link" onClick={onTransparency}>
          Integritet & transparens
        </button>
      </p>
      <p className="footer-en" lang="en">
        Swedish PII redaction, on-device. English docs on{" "}
        <a href={`${GITHUB}#readme`} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
    </footer>
  )
}
