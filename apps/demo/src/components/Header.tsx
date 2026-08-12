import copy, { activeLocale } from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
      <h1 className="title">
        <span className="sr-only">{copy.header.title}</span>
        <span aria-hidden="true" className="title-fluid">
          {copy.header.title}
        </span>
        <span aria-hidden="true" className="title-mobile-lines">
          {copy.header.titleMobile.split("\n").map((line, index, lines) => (
            <span className="title-mobile-line" key={`${index}-${line}`}>
              {line}
              {index < lines.length - 1 ? " " : null}
            </span>
          ))}
        </span>
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
