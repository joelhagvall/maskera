import { Fragment } from "react"
import { HERO_ROTATION_MS, HERO_SCENE_WIDTH, HERO_SCENES, heroScenePath } from "../heroScenes"
import copy, { activeLocale } from "../i18n"
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, MaskeraMark } from "../icons"
import { labelMeta, pillStyle } from "../labels"
import type { View } from "../routing"
import { useRotation } from "../useRotation"
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
 * Real captures of the extension (fictional test data), rendered by
 * maskera-extension `bun run capture:hero`, in a plain browser window: one
 * chat preview per work task (rotating, with tabs and Pause), masked text open, and the popup opened from the
 * Maskera icon in the toolbar, over the page's empty right side so it never
 * covers the text. The window stays light in both themes, like the captures.
 */
function HeroProduct() {
  const text = copy.header
  const scenes = HERO_SCENES.map((scene) => {
    const sceneCopy = text.heroScenes.find((item) => item.id === scene.id)
    if (!sceneCopy) throw new Error(`header.heroScenes is missing ${scene.id}`)
    return { ...scene, ...sceneCopy }
  })
  const { index, setIndex, paused, setPaused, setHeld } = useRotation(
    scenes.length,
    HERO_ROTATION_MS,
  )
  const flow = copy.extensionInstall.flowDemo

  return (
    <figure
      className="hero-product"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="hero-window">
        <div className="hero-window-bar" aria-hidden="true">
          <span className="hero-window-dots">
            <span />
            <span />
            <span />
          </span>
          <span className="hero-window-nav">
            <ChevronLeftIcon size={15} />
            <ChevronRightIcon size={15} />
          </span>
          <span className="hero-window-url">
            <LockIcon size={12} />
            {text.productLabel}
          </span>
          <span className="hero-window-ext">
            <MaskeraMark size={15} />
          </span>
        </div>
        <div className="hero-window-page">
          <div className="hero-scenes">
            {scenes.map((scene, i) => (
              <img
                key={scene.id}
                className={`hero-preview${i === index ? " is-active" : ""}`}
                src={heroScenePath(scene.id)}
                width={HERO_SCENE_WIDTH}
                height={scene.height}
                alt={scene.alt}
                aria-hidden={i === index ? undefined : true}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
              />
            ))}
          </div>
          <img
            className="hero-popup"
            src="/hero/extension-popup.webp"
            width={680}
            height={1128}
            alt={text.productPopupAlt}
            decoding="async"
          />
        </div>
      </div>
      <figcaption className="hero-scene-bar">
        <div className="tabs" role="group" aria-label={text.heroScenesLabel}>
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              type="button"
              className={`tab${i === index ? " on" : ""}`}
              aria-pressed={i === index}
              onClick={() => {
                setIndex(i)
                setPaused(true)
              }}
            >
              {scene.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ext-flow-toggle"
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? flow.play : flow.pause}
        </button>
      </figcaption>
    </figure>
  )
}
