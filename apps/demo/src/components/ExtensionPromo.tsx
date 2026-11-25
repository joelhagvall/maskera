import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { portalUrl } from "../portal"

export function ExtensionPromo() {
  return (
    <section className="extension-band" aria-labelledby="extension-promo-title">
      <div className="extension-band-copy">
        <p className="extension-band-eyebrow">{copy.extensionPromo.eyebrow}</p>
        <h2 id="extension-promo-title" className="extension-band-title">
          {copy.extensionPromo.title}
        </h2>
        <p className="extension-band-body">{copy.extensionPromo.body}</p>
      </div>
      <div className="extension-band-actions">
        <a
          className="extension-cta extension-cta-primary"
          href={portalUrl("/login?buy=extension-pro&signup=true", "demo_extension_trial")}
          target="_blank"
          rel="noreferrer"
        >
          {copy.extensionPromo.primaryCta}
          <ArrowUpRightIcon size={13} />
        </a>
        <a
          className="extension-cta extension-cta-secondary"
          href={portalUrl("/extension", "demo_extension_info")}
          target="_blank"
          rel="noreferrer"
        >
          {copy.extensionPromo.secondaryCta}
          <ArrowUpRightIcon size={13} />
        </a>
      </div>
    </section>
  )
}
