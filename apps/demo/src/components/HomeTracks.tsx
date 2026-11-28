import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { formatMb, formatPct, sizeMb, summary } from "../independentBench"
import { navClick, type View, viewPaths } from "../routing"
import { ExtensionHeroActions, SERVICES_SECTIONS } from "./ExtensionInstall"

const TRACK_SECTIONS: Record<string, string> = {
  extension: SERVICES_SECTIONS.extension,
  agents: SERVICES_SECTIONS.agents,
  sdk: SERVICES_SECTIONS.code,
}

/**
 * The three ways to use Maskera, side by side under the hero, each linking to
 * its section on the services page. Same copy as the services overview, so
 * the two pages never describe a track differently.
 */
export function HomeTracks({ goSection }: { goSection: (view: View, anchor: string) => void }) {
  return (
    <section className="home-tracks" aria-label={copy.services.overview.title}>
      {copy.services.tracks.map((track) => {
        const anchor = TRACK_SECTIONS[track.id]
        if (!anchor) throw new Error(`services.tracks has no section for ${track.id}`)
        return (
          <div key={track.id} className="home-track">
            <h2>{track.title}</h2>
            <p className="home-track-meta">{track.badge}</p>
            <p>{track.summary}</p>
            <a
              href={`${viewPaths.services}#${anchor}`}
              onClick={navClick(() => goSection("services", anchor))}
            >
              {track.cta} →
            </a>
          </div>
        )
      })}
    </section>
  )
}

/**
 * One-line proof strip straight under the hero stage: names hidden in
 * independent Swedish text, model size and licence, each linking to its
 * evidence. The numbers come from the benchmark result and the pinned model
 * artifact, never from copy.
 */
export function HomeProof({ go }: { go: (view: View) => void }) {
  const proof = copy.homeProof
  const names = summary.maskera.names
  if (!names) return null

  return (
    <section className="home-proof" aria-label={proof.label}>
      <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
        <strong>{formatPct(names.maskedPct)}</strong> {proof.accuracyDesc} →
      </a>
      <a href={viewPaths.security} onClick={navClick(() => go("security"))}>
        <strong>{formatMb(sizeMb("maskera"))}</strong>, {proof.localDesc} →
      </a>
      <a href={GITHUB} target="_blank" rel="noreferrer">
        <strong>{proof.licenseValue}</strong>, {proof.licenseDesc}
        <ArrowUpRightIcon size={12} />
      </a>
    </section>
  )
}

/**
 * What IT, security and data protection officers check first, in one block
 * on the home page, with links to the pages that hold the detail.
 */
export function HomeTrust({ go }: { go: (view: View) => void }) {
  const trust = copy.homeTrust
  return (
    <section className="home-trust" aria-labelledby="home-trust-title">
      <h2 id="home-trust-title">{trust.title}</h2>
      <div className="home-trust-grid">
        {trust.items.map((item) => (
          <div key={item.title} className="home-trust-item">
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </div>
        ))}
      </div>
      <p className="home-trust-links">
        <a href={viewPaths.security} onClick={navClick(() => go("security"))}>
          {trust.securityCta} →
        </a>
        <a href={viewPaths.faq} onClick={navClick(() => go("faq"))}>
          {trust.faqCta} →
        </a>
      </p>
    </section>
  )
}

/**
 * The closing call to action at the end of the home page: the hero's own
 * buttons again (browser icon, agent prompt copy), for visitors who scrolled
 * through the demo.
 */
export function HomeClosing({
  go,
  goSection,
}: {
  go: (view: View) => void
  goSection: (view: View, anchor: string) => void
}) {
  const closing = copy.homeClosing
  return (
    <section className="home-closing" aria-labelledby="home-closing-title">
      <h2 id="home-closing-title">{closing.title}</h2>
      <ExtensionHeroActions go={go} goSection={goSection} belowDemo />
    </section>
  )
}
