import { GITHUB, HF_MODEL } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { portalUrl } from "../portal"
import { navClick, viewPaths } from "../routing"

export function Footer({
  onServices,
  onDevelopers,
  onTransparency,
  onTestData,
  onPolicy,
  onAccuracy,
  onSecurity,
  onAbout,
}: {
  onServices?: () => void
  onDevelopers?: () => void
  onTransparency: () => void
  onTestData: () => void
  onPolicy: () => void
  onAccuracy: () => void
  onSecurity: () => void
  onAbout: () => void
}) {
  return (
    <footer className="footer">
      <nav className="footer-grid" aria-label={copy.footer.navLabel}>
        <div className="footer-col">
          <p className="footer-heading">{copy.footer.columns.product}</p>
          <ul>
            <li>
              <a
                className="footer-link"
                href={viewPaths.services}
                onClick={onServices ? navClick(onServices) : undefined}
              >
                {copy.navigation.services}
              </a>
            </li>
            <li>
              <a
                className="footer-link"
                href={viewPaths.dev}
                onClick={onDevelopers ? navClick(onDevelopers) : undefined}
              >
                {copy.navigation.developers}
              </a>
            </li>
            <li>
              <a className="footer-link" href={viewPaths.accuracy} onClick={navClick(onAccuracy)}>
                {copy.navigation.accuracy}
              </a>
            </li>
            <li>
              <a href={portalUrl("/login", "footer_portal")} target="_blank" rel="noreferrer">
                {copy.footer.portal}
                <ArrowUpRightIcon size={12} />
              </a>
            </li>
          </ul>
        </div>
        <div className="footer-col">
          <p className="footer-heading">{copy.footer.columns.trust}</p>
          <ul>
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
          </ul>
        </div>
        <div className="footer-col">
          <p className="footer-heading">{copy.footer.columns.project}</p>
          <ul>
            <li>
              <a href={GITHUB} target="_blank" rel="noreferrer">
                {copy.footer.openSource}
                <ArrowUpRightIcon size={12} />
              </a>
            </li>
            <li>
              <a href={HF_MODEL} target="_blank" rel="noreferrer">
                {copy.footer.modelLink}
                <ArrowUpRightIcon size={12} />
              </a>
            </li>
            <li>
              <a href="/whitepaper.pdf" target="_blank" rel="noreferrer">
                {copy.footer.whitepaper}
                <ArrowUpRightIcon size={12} />
              </a>
            </li>
            <li>
              <a className="footer-link" href={viewPaths.about} onClick={navClick(onAbout)}>
                {copy.navigation.about}
              </a>
            </li>
          </ul>
        </div>
      </nav>
      <p className="footer-row footer-credit">
        {copy.footer.creditPrefix}{" "}
        <a href="https://hagvall-labs.com" target="_blank" rel="noreferrer">
          {copy.footer.author}
        </a>
        .
      </p>
    </footer>
  )
}
