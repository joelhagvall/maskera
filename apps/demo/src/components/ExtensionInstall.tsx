import type { ReactElement } from "react"
import {
  EXTENSION_BROWSERS,
  EXTENSION_DOWNLOAD_URL,
  featuredBrowser,
  useVisitorBrowser,
} from "../extensionBrowsers"
import copy from "../i18n"
import { ArrowUpRightIcon, BROWSER_ICONS } from "../icons"
import { hlStyle, labelMeta, pillStyle } from "../labels"
import { portalUrl } from "../portal"
import { navClick, type View, viewPaths } from "../routing"
import { useRotation } from "../useRotation"

export const INSTALL_ANCHOR = "installera"

const FLOW_STEP_MS = 2_800

function ExtensionFlowDemo() {
  const demo = copy.extensionInstall.flowDemo
  const {
    index: step,
    setIndex: setStep,
    paused,
    setPaused,
  } = useRotation(demo.steps.length, FLOW_STEP_MS)

  const nameMeta = labelMeta("NAMN")
  const pnrMeta = labelMeta("PERSONNUMMER")
  const addrMeta = labelMeta("ADRESS")

  const renderEntity = (original: string, token: string, meta: ReturnType<typeof labelMeta>) =>
    step === 0 ? (
      original
    ) : step === 1 ? (
      <mark className="hl" style={hlStyle(meta)}>
        {original}
      </mark>
    ) : (
      <span className="token" style={pillStyle(meta)}>
        {token}
      </span>
    )

  return (
    <div className="ext-flow-demo" role="region" aria-label={demo.regionLabel} data-step={step}>
      <div className="ext-flow-head">
        <div className="ext-flow-steps" role="group" aria-label={demo.regionLabel}>
          {demo.steps.map((label, idx) => {
            const active = step === idx
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                className={`ext-flow-step${active ? " is-active" : ""}`}
                onClick={() => {
                  setStep(idx)
                  setPaused(true)
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="ext-flow-toggle"
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? demo.play : demo.pause}
        </button>
      </div>

      <div className={`ext-flow-composer${step === 2 ? " is-sent" : ""}`}>
        <p className="ext-flow-prompt">
          {demo.prefix}
          {renderEntity(demo.sampleName, copy.header.exampleMarker, nameMeta)}
          {demo.mid1}
          {renderEntity(demo.samplePnr, demo.samplePnrMarker, pnrMeta)}
          {demo.mid2}
          {renderEntity(demo.sampleAddress, demo.sampleAddressMarker, addrMeta)}
          {demo.suffix}
        </p>
        <span
          className={`ext-flow-send${step === 2 ? " is-pulse" : ""}`}
          aria-hidden="true"
          title={demo.sendAria}
        >
          ↑
        </span>
      </div>

      <div className={`ext-flow-bar${step >= 1 ? " is-visible" : ""}`} aria-hidden={step === 0}>
        {step === 2 ? (
          <span className="ext-flow-sent">{demo.sentBadge}</span>
        ) : (
          <>
            <span className="ext-flow-bar-label">{demo.previewLabel}</span>
            <span className="ext-flow-chips">
              <span className="ext-flow-chip">
                <span className="token" style={pillStyle(nameMeta)}>
                  {copy.header.exampleMarker}
                </span>
                <span className="ext-flow-orig">{demo.sampleName}</span>
              </span>
              <span className="ext-flow-chip">
                <span className="token" style={pillStyle(pnrMeta)}>
                  {demo.samplePnrMarker}
                </span>
                <span className="ext-flow-orig">{demo.samplePnr}</span>
              </span>
              <span className="ext-flow-chip">
                <span className="token" style={pillStyle(addrMeta)}>
                  {demo.sampleAddressMarker}
                </span>
                <span className="ext-flow-orig">{demo.sampleAddress}</span>
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Hero call to action. One primary button that fits the visitor: the store
 * button for their browser once that listing is live, the install section
 * until then, and the in-page demo on phones, which cannot run extensions.
 */
export function ExtensionHeroActions({ go }: { go: (view: View) => void }) {
  const text = copy.extensionInstall
  const visitor = useVisitorBrowser()
  const featured = featuredBrowser(visitor, EXTENSION_BROWSERS)
  const others = EXTENSION_BROWSERS.filter((browser) => browser.id !== featured?.id)

  let primary: ReactElement
  if (featured?.storeUrl) {
    const Icon = BROWSER_ICONS[featured.id]
    primary = (
      <a
        className="hero-cta hero-cta-primary"
        href={featured.storeUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Icon size={17} />
        {text.heroAddTo.replace("{browser}", text.browsers[featured.id].name)}
      </a>
    )
  } else if (visitor === "mobile") {
    primary = (
      <a className="hero-cta hero-cta-primary" href="#main-content">
        {text.heroTryDemo}
      </a>
    )
  } else {
    primary = (
      <a className="hero-cta hero-cta-primary" href={`#${INSTALL_ANCHOR}`}>
        {text.heroInstall}
      </a>
    )
  }

  return (
    <div className="hero-install">
      <div className="hero-cta-row">
        {primary}{" "}
        <a
          className="hero-cta hero-cta-secondary"
          href={viewPaths.services}
          onClick={navClick(() => go("services"))}
        >
          {text.heroLearnMore}
        </a>
      </div>
      <p className="hero-browsers">
        <span>{featured ? text.alsoFor : text.builtFor}</span>
        {others.map((browser) => {
          const Icon = BROWSER_ICONS[browser.id]
          return (
            <span
              key={browser.id}
              className="hero-browser"
              role="img"
              aria-label={text.browsers[browser.id].name}
              title={text.browsers[browser.id].name}
            >
              <Icon size={14} />
            </span>
          )
        })}
        <span className="hero-browsers-note">{text.freeNote}</span>
      </p>
    </div>
  )
}

/**
 * The install section: one row per browser with its store, live rows link
 * out and the rest show "Snart". The ZIP stays as a manual fallback until
 * the stores are live. `trialContent` adds the Pro trial link with that
 * attribution tag; pages that already offer the trial leave it out.
 */
export function ExtensionInstall({
  trialContent,
  compact = false,
  showFlowDemo = false,
}: {
  trialContent?: string
  compact?: boolean
  showFlowDemo?: boolean
}) {
  const text = copy.extensionInstall

  return (
    <section id={INSTALL_ANCHOR} aria-labelledby="installera-heading" className="ext-install">
      <div className="ext-install-copy">
        <h2 id="installera-heading" className="ext-install-title">
          {text.title}
        </h2>
        <p className="ext-install-body">{compact ? text.compactBody : text.body}</p>
        {trialContent ? (
          <a
            className="ext-install-trial"
            href={portalUrl("/login?buy=extension-pro&signup=true", trialContent)}
            target="_blank"
            rel="noreferrer"
          >
            {text.trialCta}
            <ArrowUpRightIcon size={13} />
          </a>
        ) : null}
        <p className="ext-install-zip">
          {text.zipLead}{" "}
          <a href={EXTENSION_DOWNLOAD_URL} download>
            {text.zipCta}
          </a>{" "}
          {text.zipTail}
        </p>
      </div>
      <ul className="ext-browsers" aria-label={text.listLabel}>
        {EXTENSION_BROWSERS.map((browser) => {
          const Icon = BROWSER_ICONS[browser.id]
          const label = text.browsers[browser.id]
          const body = (
            <>
              <Icon size={20} className="ext-browser-icon" />
              <span className="ext-browser-text">
                <span className="ext-browser-name">{label.name}</span>{" "}
                <span className="ext-browser-store">{label.store}</span>
              </span>
            </>
          )
          return (
            <li key={browser.id}>
              {browser.storeUrl ? (
                <a className="ext-browser" href={browser.storeUrl} target="_blank" rel="noreferrer">
                  {body}
                  <ArrowUpRightIcon size={14} className="ext-browser-end" />
                </a>
              ) : (
                <div className="ext-browser ext-browser-soon">
                  {body} <span className="ext-browser-end ext-soon">{text.soon}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {showFlowDemo ? <ExtensionFlowDemo /> : null}
    </section>
  )
}
