import type { RedactResult } from "@maskera/core"
import copy from "../i18n"
import { navClick, viewPaths } from "../routing"
import { RedactedText } from "../segments"
import { CopyButton } from "./CopyButton"
import { TryStep } from "./TryStep"

function RestoreMap({ map }: { map: Record<string, string> }) {
  return (
    <div className="map" id="restore-map" lang="sv" translate="no">
      <p className="map-note">{copy.outputCard.restoreMapNote}</p>
      <table>
        <tbody>
          {Object.entries(map).map(([token, value]) => (
            <tr key={token}>
              <td className="map-token">{token}</td>
              <td className="arrow">→</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OutputCard({
  result,
  analyzing,
  invalidPnrs,
  showMap,
  onToggleMap,
  onCoverage,
}: {
  result: RedactResult
  analyzing: boolean
  invalidPnrs: string[]
  /** Owned by App so the toggle survives scenario switches. */
  showMap: boolean
  onToggleMap: () => void
  /** Client-side navigation to the "Vad maskeras?" section on the transparency page. */
  onCoverage: () => void
}) {
  const unique = Object.keys(result.map).length
  const count = result.redactions.length

  return (
    <TryStep
      n={2}
      label={
        <>
          {copy.outputCard.title} · {count}{" "}
          {count === 1 ? copy.outputCard.singularCount : copy.outputCard.pluralCount}
          {analyzing ? <span className="try-busy"> · {copy.outputCard.analyzing}</span> : null}
        </>
      }
      action={result.text ? <CopyButton text={result.text} className="clear copy" /> : null}
    >
      <div className={`output ${analyzing ? "analyzing" : ""}`} lang="sv" translate="no">
        <RedactedText text={result.text} />
      </div>

      {/* 19900101-2385 är ett av Skatteverkets reserverade testpersonnummer
          (öppna data, spärrat från att någonsin tilldelas en verklig person),
          så demon uppmanar aldrig någon att skriva in ett riktigt nummer. */}
      {invalidPnrs.length > 0 && (
        <p className="checksum-note">
          <span className="checksum-value">{invalidPnrs.join(", ")}</span>{" "}
          {invalidPnrs.length === 1
            ? copy.outputCard.invalidPersonnummerSingular
            : copy.outputCard.invalidPersonnummerPlural}{" "}
          {copy.outputCard.testPersonnummerCta}
        </p>
      )}

      {/* The moment someone wonders why a value was (or was not) masked is
          right here, so the coverage page is one click away from the result. */}
      <div className="card-links">
        {unique > 0 && (
          <button
            type="button"
            className="link"
            aria-expanded={showMap}
            aria-controls="restore-map"
            onClick={onToggleMap}
          >
            {showMap ? copy.outputCard.hideKey : copy.outputCard.showKey} ({unique})
          </button>
        )}
        <a
          className="link"
          href={`${viewPaths.transparency}#vad-maskeras`}
          onClick={navClick(onCoverage)}
        >
          {copy.outputCard.coverageLink}
        </a>
      </div>
      {unique > 0 && (showMap ? <RestoreMap map={result.map} /> : <div id="restore-map" hidden />)}
    </TryStep>
  )
}
