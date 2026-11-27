import copy, { activeLocale } from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, viewPaths } from "../routing"

/**
 * The two-layer architecture diagram (layers.svg and its Swedish and dark
 * derivations), swapped on the theme toggle. One figure for the developer
 * page and the docs overview, so the two never show different diagrams.
 */
export function ArchitectureFigure({ onCoverage }: { onCoverage: () => void }) {
  const lightDiagram = activeLocale === "sv" ? "/layers-sv.svg" : "/layers.svg"
  const darkDiagram = activeLocale === "sv" ? "/layers-sv-dark.svg" : "/layers-dark.svg"

  return (
    <figure className="layers-fig">
      <img
        className="layers-light"
        src={lightDiagram}
        width="1200"
        height="640"
        loading="lazy"
        alt={copy.developerApi.diagramAlt}
      />
      <img
        className="layers-dark"
        src={darkDiagram}
        width="1200"
        height="640"
        loading="lazy"
        alt=""
        aria-hidden="true"
      />
      <figcaption>
        <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
          {copy.coverage.linkCta}
        </a>
        <a className="layers-expand" href={lightDiagram} target="_blank" rel="noreferrer">
          {copy.developerApi.diagramOpen}
          <ArrowUpRightIcon size={13} />
        </a>
      </figcaption>
    </figure>
  )
}
