import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { SERVICES_SECTIONS } from "./ExtensionInstall"

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
 * Compact factual proof strip on the home page: reuses the benchmark-synced
 * pipeline hit rate and model size from copy.accuracy.currentStats so the
 * numbers stay in lockstep with docs/benchmark-release.json.
 */
export function HomeProof({ go }: { go: (view: View) => void }) {
  const proof = copy.homeProof
  const pipeline = copy.accuracy.currentStats[2]
  const modelSize = copy.accuracy.currentStats[3]
  if (!pipeline || !modelSize) return null

  return (
    <section className="home-proof" aria-label={proof.label}>
      <div className="home-proof-item">
        <p className="home-proof-value">{pipeline.value}</p>
        <p className="home-proof-desc">{pipeline.label}</p>
        <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
          {proof.accuracyCta} →
        </a>
      </div>
      <div className="home-proof-item">
        <p className="home-proof-value">{modelSize.value}</p>
        <p className="home-proof-desc">{proof.localDesc}</p>
        <a href={viewPaths.security} onClick={navClick(() => go("security"))}>
          {proof.securityCta} →
        </a>
      </div>
      <div className="home-proof-item">
        <p className="home-proof-value">{proof.licenseValue}</p>
        <p className="home-proof-desc">{proof.licenseDesc}</p>
        <a href={GITHUB} target="_blank" rel="noreferrer">
          {proof.githubCta}
          <ArrowUpRightIcon size={12} />
        </a>
      </div>
    </section>
  )
}
