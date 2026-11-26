import { Fragment } from "react"
import copy, { activeLocale } from "../i18n"
import type { View } from "../routing"
import { ExtensionHeroActions } from "./ExtensionInstall"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
      <div className="hero">
        {/* One copy of the heading text: crawlers and screen readers read the
            same sentence once, and CSS turns the spans into the deliberate
            phone line breaks. */}
        <h1 className="title">
          {copy.header.titleMobile.split("\n").map((line, index) => (
            <Fragment key={`${index}-${line}`}>
              {index > 0 ? " " : null}
              <span className="title-line">{line}</span>
            </Fragment>
          ))}
        </h1>
        <p className="lede">
          {copy.header.lede.split("{marker}").map((part, index) => (
            <Fragment key={`${index}-${part}`}>
              {index > 0 ? <code className="lede-marker">{copy.header.exampleMarker}</code> : null}
              {part}
            </Fragment>
          ))}{" "}
          {copy.header.browserLead} <strong>{copy.header.browserEmphasis}</strong>.
        </p>
        <ExtensionHeroActions go={go} />
        {activeLocale === "en" ? (
          <p className="demo-language-note">{copy.demo.languageNote}</p>
        ) : null}
        <HeroProduct />
      </div>
    </header>
  )
}

/**
 * Real captures of the extension (0.2.0, fictional test data) in a neutral
 * chat window: the preview under the composer with the masked text open,
 * and the popup on top.
 */
function HeroProduct() {
  return (
    <figure className="hero-product">
      <div className="hero-window">
        <div className="hero-window-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <em>{copy.header.productLabel}</em>
        </div>
        <img
          src="/hero/extension-preview.webp"
          width={1368}
          height={452}
          alt={copy.header.productPreviewAlt}
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <img
        className="hero-popup"
        src="/hero/extension-popup.webp"
        width={680}
        height={1052}
        alt={copy.header.productPopupAlt}
        decoding="async"
      />
    </figure>
  )
}
