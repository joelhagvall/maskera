import copy, { activeLocale } from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

export function Header({ go }: { go: (view: View) => void }) {
  return (
    <header className="header">
      <TopBar current="demo" go={go} />
      <h1 className="title">{copy.header.title}</h1>
      <p className="lede">
        {copy.header.lede} {copy.header.browserLead} <strong>{copy.header.browserEmphasis}</strong>.{" "}
        {copy.header.browserPrivacy}
      </p>
      <p className="hero-local-production">
        {copy.header.localProduction}{" "}
        <a href={viewPaths.services} onClick={navClick(() => go("services"))}>
          {copy.header.servicesCta} <span aria-hidden="true">→</span>
        </a>
      </p>
      {activeLocale === "en" ? (
        <p className="demo-language-note">{copy.demo.languageNote}</p>
      ) : null}
    </header>
  )
}
