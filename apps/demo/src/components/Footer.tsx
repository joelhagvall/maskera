import { GITHUB, HF_MODEL } from "../constants"
import { preloadTransparency } from "../pages"
import { navClick, viewPaths } from "../routing"

export function Footer({
  onTransparency,
  onPolicy,
}: {
  onTransparency: () => void
  onPolicy: () => void
}) {
  return (
    <footer className="footer">
      <p className="footer-row">
        Öppen källkod med{" "}
        <a href={HF_MODEL} target="_blank" rel="noreferrer">
          en egentränad svensk AI-modell
        </a>
        , allt körs i din webbläsare. Ingen data skickas någonstans.
      </p>
      <p className="footer-row">
        <a
          className="footer-link"
          href={viewPaths.transparency}
          onClick={navClick(onTransparency)}
          onPointerEnter={() => preloadTransparency()}
          onFocus={() => preloadTransparency()}
        >
          Integritet & transparens
        </a>{" "}
        ·{" "}
        <a
          className="footer-link"
          href={`${viewPaths.transparency}#integritetspolicy`}
          onClick={navClick(onPolicy)}
          onPointerEnter={() => preloadTransparency()}
          onFocus={() => preloadTransparency()}
        >
          Integritetspolicy
        </a>{" "}
        ·{" "}
        <a href="/whitepaper.pdf" target="_blank" rel="noreferrer">
          Whitepaper (PDF)
        </a>
      </p>
      <p className="footer-en" lang="en">
        Swedish PII redaction, on-device. English docs on{" "}
        <a href={`${GITHUB}#readme`} target="_blank" rel="noreferrer">
          GitHub
        </a>
        .
      </p>
      <p className="footer-row">
        Byggd av{" "}
        <a href="https://joelhagvall.com" target="_blank" rel="noreferrer">
          Joel Hägvall
        </a>
        .
      </p>
    </footer>
  )
}
