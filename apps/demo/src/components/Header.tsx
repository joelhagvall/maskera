import { Fragment } from "react"
import copy, { activeLocale } from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
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
        {copy.header.lede} {copy.header.browserLead} <strong>{copy.header.browserEmphasis}</strong>.{" "}
        {copy.header.browserPrivacy}
      </p>
      <p className="hero-local-production">
        <span className="hero-local-production-desktop-copy">{copy.header.localProduction}</span>
        <span className="hero-local-production-mobile-copy">
          {copy.header.localProductionMobile}
        </span>{" "}
        <a href={viewPaths.services} onClick={navClick(() => go("services"))}>
          <span className="hero-local-production-desktop-cta">{copy.header.servicesCta}</span>
          <span className="hero-local-production-mobile-cta">{copy.header.servicesCtaMobile}</span>{" "}
          <span aria-hidden="true">→</span>
        </a>
      </p>
      {activeLocale === "en" ? (
        <p className="demo-language-note">{copy.demo.languageNote}</p>
      ) : null}
    </header>
  )
}
