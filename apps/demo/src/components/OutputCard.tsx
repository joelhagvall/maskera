import type { RedactResult } from "@maskera/core"
import { useMemo } from "react"
import copy from "../i18n"
import { EyeIcon } from "../icons"
import { labelMeta, pillStyle } from "../labels"
import { navClick, viewPaths } from "../routing"
import { RedactedText } from "../segments"
import { CopyButton } from "./CopyButton"

function Stats({ result }: { result: RedactResult }) {
  const counts = useMemo(() => {
    // Redactions arrive position-sorted, so Map insertion order = text order.
    const c = new Map<string, number>()
    for (const r of result.redactions) c.set(r.label, (c.get(r.label) ?? 0) + 1)
    return [...c.entries()]
  }, [result.redactions])

  return (
    <div className="stats">
      <div className="count">
        <span className="num">{result.redactions.length}</span>
        <span className="num-l">
          {result.redactions.length === 1
            ? copy.outputCard.singularCount
            : copy.outputCard.pluralCount}
        </span>
      </div>
      <div className="tags">
        {counts.map(([label, n]) => {
          const m = labelMeta(label)
          return (
            <span key={label} className="tag" style={pillStyle(m)}>
              {m.sv}
              <span className="tag-n">{n}</span>
            </span>
          )
        })}
      </div>
    </div>
  )
}

function RestoreMap({ map }: { map: Record<string, string> }) {
  return (
    <div className="map" id="restore-map" lang="sv" translate="no">
      <p className="map-note">{copy.outputCard.restoreMapNote}</p>
      <table>
        <tbody>
          {Object.entries(map).map(([token, value]) => (
            <tr key={token}>
              <td className="mono">{token}</td>
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

  return (
    <section className="card">
      <div className="card-head">
        <span className="card-title">
          <EyeIcon size={14} />
          {copy.outputCard.title}
          {analyzing && <span className="card-sub">{copy.outputCard.analyzing}</span>}
        </span>
        {result.text ? <CopyButton text={result.text} className="clear copy" /> : null}
      </div>

      <div className={`output ${analyzing ? "analyzing" : ""}`} lang="sv" translate="no">
        <RedactedText text={result.text} />
      </div>

      {/* 19900101-2385 är ett av Skatteverkets reserverade testpersonnummer
          (öppna data, spärrat från att någonsin tilldelas en verklig person),
          så demon uppmanar aldrig någon att skriva in ett riktigt nummer. */}
      {invalidPnrs.length > 0 && (
        <p className="checksum-note">
          <span className="mono">{invalidPnrs.join(", ")}</span>{" "}
          {invalidPnrs.length === 1
            ? copy.outputCard.invalidPersonnummerSingular
            : copy.outputCard.invalidPersonnummerPlural}{" "}
          {copy.outputCard.testPersonnummerCta}
        </p>
      )}

      <Stats result={result} />

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
    </section>
  )
}
