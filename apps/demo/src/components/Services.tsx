import { type KeyboardEvent, useEffect, useRef, useState } from "react"
import { GITHUB, NPM_MCP } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { portalUrl } from "../portal"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { AgentSetupCard } from "./AgentSetupCard"
import { CopyButton } from "./CopyButton"
import { ExtensionInstall } from "./ExtensionInstall"
import { TopBar } from "./TopBar"

type TrackId = "extension" | "agents" | "sdk"

const TRACK_HASHES: Record<TrackId, string> = {
  extension: "#tillagg",
  agents: "#agenter",
  sdk: "#kod",
}

function trackFromHash(hash: string): TrackId {
  const normalized = hash.toLowerCase()
  if (normalized === "#agenter" || normalized === "#agents" || normalized === "#mcp") {
    return "agents"
  }
  if (normalized === "#kod" || normalized === "#sdk" || normalized === "#code") {
    return "sdk"
  }
  return "extension"
}

export function Services({ go, onCoverage }: { go: (view: View) => void; onCoverage: () => void }) {
  const services = copy.services
  const compare = services.compare
  const [track, setTrack] = useState<TrackId>(() =>
    typeof window === "undefined" ? "extension" : trackFromHash(window.location.hash),
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const onHashChange = () => setTrack(trackFromHash(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  function selectTrack(next: TrackId, focusIndex?: number) {
    setTrack(next)
    if (typeof window !== "undefined") {
      const targetHash = TRACK_HASHES[next]
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, "", `${window.location.pathname}${targetHash}`)
      }
    }
    if (focusIndex !== undefined) tabRefs.current[focusIndex]?.focus()
  }

  function onTrackKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const tracks = services.tracks
    let nextIndex: number | null = null
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tracks.length
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tracks.length) % tracks.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = tracks.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = tracks[nextIndex]
    if (next) selectTrack(next.id as TrackId, nextIndex)
  }

  return (
    <>
      <header>
        <TopBar current="services" go={go} />
      </header>

      <main id="main-content">
        <article className="prose">
          <h1>{services.title}</h1>
          <p className="prose-lede">{services.lede}</p>
          <p className="prose-sub">{services.sublede}</p>

          <div className="track-picker" role="tablist" aria-label={services.tracksLabel}>
            {services.tracks.map((item, index) => {
              const selected = track === item.id
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    tabRefs.current[index] = el
                  }}
                  type="button"
                  role="tab"
                  id={`track-tab-${item.id}`}
                  aria-selected={selected}
                  aria-controls={`track-panel-${item.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`track-card${selected ? " is-active" : ""}`}
                  onClick={() => selectTrack(item.id as TrackId)}
                  onKeyDown={(e) => onTrackKeyDown(e, index)}
                >
                  <span className="track-card-top">
                    <span className="track-card-title">{item.title}</span>
                    <span className="track-card-badge">{item.badge}</span>
                  </span>
                  <span className="track-card-desc">{item.summary}</span>
                </button>
              )
            })}
          </div>

          <section
            id="track-panel-extension"
            role="tabpanel"
            aria-labelledby="track-tab-extension"
            hidden={track !== "extension"}
            className="track-panel"
          >
            <ExtensionInstall compact showFlowDemo />

            <section id="jamfor" aria-labelledby="jamfor-heading" className="ext-compare">
              <h2 id="jamfor-heading">{compare.title}</h2>
              <div className="ext-table-wrap">
                <table className="data-table" aria-labelledby="jamfor-heading">
                  <thead>
                    <tr>
                      <th scope="col">{compare.featureColumn}</th>
                      <th scope="col">{compare.freeTitle}</th>
                      <th scope="col">{compare.proTitle}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.rows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row">{row.feature}</th>
                        <td>{row.free}</td>
                        <td>{row.pro}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ext-trial-row">
                <div className="ext-trial-copy">
                  <p className="ext-trial-price">{compare.trialPrice}</p>
                  <p className="ext-trial-details">{compare.trialDetails}</p>
                  <p className="ext-trial-links">
                    <a
                      href={portalUrl("/extension/terms", "services_extension_terms")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {compare.termsCta}
                      <ArrowUpRightIcon size={12} />
                    </a>
                    <span aria-hidden="true"> · </span>
                    <a
                      href={portalUrl("/extension/privacy", "services_extension_privacy")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {compare.privacyCta}
                      <ArrowUpRightIcon size={12} />
                    </a>
                  </p>
                </div>
                <a
                  className="ext-trial-cta"
                  href={portalUrl("/login?buy=extension-pro&signup=true", "services_compare_trial")}
                  target="_blank"
                  rel="noreferrer"
                >
                  {compare.startTrialCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </div>
            </section>
          </section>

          <section
            id="track-panel-agents"
            role="tabpanel"
            aria-labelledby="track-tab-agents"
            hidden={track !== "agents"}
            className="track-panel"
          >
            <div className="track-panel-head">
              <h2>{services.agents.title}</h2>
              <p>{services.agents.body}</p>
            </div>

            <AgentSetupCard idPrefix="services-agent" />

            <div className="agent-highlights">
              {services.agents.highlights.map((item) => (
                <div key={item.title} className="agent-highlight">
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>

            <p className="track-foot-links">
              <a href={NPM_MCP} target="_blank" rel="noreferrer">
                {services.agents.npmCta}
                <ArrowUpRightIcon size={12} />
              </a>
              <span aria-hidden="true"> · </span>
              <a href={`${GITHUB}/tree/main/packages/mcp`} target="_blank" rel="noreferrer">
                {services.agents.docsCta}
                <ArrowUpRightIcon size={12} />
              </a>
            </p>
          </section>

          <section
            id="track-panel-sdk"
            role="tabpanel"
            aria-labelledby="track-tab-sdk"
            hidden={track !== "sdk"}
            className="track-panel"
          >
            <div className="track-panel-head">
              <h2>{services.sdk.title}</h2>
              <p>{services.sdk.body}</p>
            </div>

            <div className="code-block install-tabs">
              <div className="code-head">
                <span className="shared-language-label">{services.sdk.packageManagerLabel}</span>
                <CopyButton
                  text={services.sdk.installCommand}
                  className="code-copy"
                  iconSize={14}
                  ariaLabel={copy.copyButton.copyCode}
                  title={copy.copyButton.copy}
                />
              </div>
              <pre>
                <code>
                  <span className="code-line">{services.sdk.installCommand}</span>
                </code>
              </pre>
            </div>

            <ul className="sdk-points">
              {services.sdk.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>

            <div className="track-panel-cta-row">
              <a className="ext-trial-cta" href={viewPaths.dev} onClick={navClick(() => go("dev"))}>
                {services.sdk.cta}
              </a>
              <a className="agent-llms-link" href={GITHUB} target="_blank" rel="noreferrer">
                {services.sdk.githubCta}
                <ArrowUpRightIcon size={12} />
              </a>
            </div>
          </section>

          <p className="coverage-link">
            {copy.coverage.servicesLink}{" "}
            <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
              {copy.coverage.linkCta}
            </a>{" "}
            {services.accuracyLead}{" "}
            <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
              {copy.accuracy.servicesCta}
            </a>
            .
          </p>
        </article>
      </main>
    </>
  )
}
