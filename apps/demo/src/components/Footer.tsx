import { HF_MODEL } from "../constants"
import copy from "../i18n/sv.json"
import { navClick, viewPaths } from "../routing"

export function Footer({
  onTransparency,
  onPolicy,
  onServices,
  onAccuracy,
  onSecurity,
}: {
  onTransparency: () => void
  onPolicy: () => void
  onServices: () => void
  onAccuracy: () => void
  onSecurity: () => void
}) {
  return (
    <footer className="footer">
      <p className="footer-row footer-intro">
        Öppen källkod med{" "}
        <a href={HF_MODEL} target="_blank" rel="noreferrer">
          en egentränad svensk AI-modell
        </a>
        . Den öppna demon kör modellen i din webbläsare. Texten och återställningsnyckeln skickas
        inte för maskering.
      </p>
      <nav className="footer-nav" aria-label="Integritet och dokumentation">
        <ul>
          <li>
            <a className="footer-link" href={viewPaths.accuracy} onClick={navClick(onAccuracy)}>
              {copy.navigation.accuracy}
            </a>
          </li>
          <li>
            <a className="footer-link" href={viewPaths.security} onClick={navClick(onSecurity)}>
              {copy.navigation.security}
            </a>
          </li>
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
        Vill ni bygga en egen integration med npm-paketen eller välja Gateway som signerad
        företagsleverans? Se{" "}
        <a className="footer-link" href={viewPaths.services} onClick={navClick(onServices)}>
          Maskera för företag
        </a>
        .
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
