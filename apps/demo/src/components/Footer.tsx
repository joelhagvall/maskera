import { HF_MODEL } from "../constants"
import { navClick, viewPaths } from "../routing"

export function Footer({
  onTransparency,
  onPolicy,
  onServices,
}: {
  onTransparency: () => void
  onPolicy: () => void
  onServices: () => void
}) {
  return (
    <footer className="footer">
      <p className="footer-row footer-intro">
        Öppen källkod med{" "}
        <a href={HF_MODEL} target="_blank" rel="noreferrer">
          en egentränad svensk AI-modell
        </a>
        , allt körs i din webbläsare. Ingen data skickas någonstans.
      </p>
      <nav className="footer-nav" aria-label="Integritet och dokumentation">
        <ul>
          <li>
            <a
              className="footer-link"
              href={viewPaths.transparency}
              onClick={navClick(onTransparency)}
            >
              Integritet & transparens
            </a>
          </li>
          <li>
            <a
              className="footer-link"
              href={`${viewPaths.transparency}#integritetspolicy`}
              onClick={navClick(onPolicy)}
            >
              Integritetspolicy
            </a>
          </li>
          <li>
            <a href="/whitepaper.pdf" target="_blank" rel="noreferrer">
              Whitepaper (PDF)
            </a>
          </li>
        </ul>
      </nav>
      <p className="footer-row footer-help">
        Vill du ha hjälp att integrera maskera i er produkt eller era AI-flöden? Se{" "}
        <a className="footer-link" href={viewPaths.services} onClick={navClick(onServices)}>
          tjänster
        </a>{" "}
        eller mejla <a href="mailto:work@joelhagvall.com">work@joelhagvall.com</a>
      </p>
      <p className="footer-row footer-credit">
        Byggd av{" "}
        <a href="https://joelhagvall.com" target="_blank" rel="noreferrer">
          Joel Hägvall
        </a>
        .
      </p>
    </footer>
  )
}
