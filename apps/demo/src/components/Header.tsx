import { Fragment } from "react"
import copy, { activeLocale } from "../i18n"
import { labelMeta, pillStyle } from "../labels"
import type { View } from "../routing"
import { ExtensionHeroActions } from "./ExtensionInstall"
import { HeroStage } from "./HeroStage"
import { TopBar } from "./TopBar"

export function Header({
  go,
  goSection,
}: {
  go: (view: View) => void
  goSection: (view: View, anchor: string) => void
}) {
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
              {index > 0 ? (
                <code className="token lede-marker" style={pillStyle(labelMeta("NAMN"))}>
                  {copy.header.exampleMarker}
                </code>
              ) : null}
              {part}
            </Fragment>
          ))}{" "}
          {copy.header.browserLead} <strong>{copy.header.browserEmphasis}</strong>.
        </p>
        <ExtensionHeroActions goSection={goSection} />
        {activeLocale === "en" ? (
          <p className="demo-language-note">{copy.demo.languageNote}</p>
        ) : null}
        <HeroStage />
      </div>
    </header>
  )
}
