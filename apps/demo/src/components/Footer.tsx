import { GITHUB, HF_MODEL } from "../constants"
import copy from "../i18n"
import { navClick, viewPaths } from "../routing"

export function Footer({
  onTransparency,
  onTestData,
  onPolicy,
  onAccuracy,
  onSecurity,
}: {
  onTransparency: () => void
  onTestData: () => void
  onPolicy: () => void
  onAccuracy: () => void
  onSecurity: () => void
}) {
  return (
    <footer className="footer">
      <p className="footer-row footer-intro">
        <a href={GITHUB} target="_blank" rel="noreferrer">
          {copy.footer.openSource}
        </a>{" "}
        ·{" "}
        <a href={HF_MODEL} target="_blank" rel="noreferrer">
          {copy.footer.modelLink}
        </a>
      </p>
      <nav className="footer-nav" aria-label={copy.footer.navLabel}>
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
              {copy.navigation.transparency}
            </a>
          </li>
          <li>
            <a className="footer-link" href={viewPaths.privacy} onClick={navClick(onPolicy)}>
              {copy.navigation.privacyPolicy}
            </a>
          </li>
          <li>
            <a className="footer-link" href={viewPaths.testdata} onClick={navClick(onTestData)}>
              {copy.navigation.testData}
            </a>
          </li>
          <li>
            <a href="/whitepaper.pdf" target="_blank" rel="noreferrer">
              {copy.footer.whitepaper}
            </a>
          </li>
        </ul>
      </nav>
      <p className="footer-row footer-credit">
        {copy.footer.creditPrefix}{" "}
        <a href="https://joelhagvall.com" target="_blank" rel="noreferrer">
          {copy.footer.author}
        </a>
        .
      </p>
    </footer>
  )
}
