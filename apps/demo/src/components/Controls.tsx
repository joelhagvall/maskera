import { DOMAIN_ICONS } from "../icons"
import { type Scenario, scenarios } from "../scenarios"
import type { NerStatus } from "../useSwedishNer"

function ModelStatus({
  status,
  progress,
  analyzing,
}: {
  status: NerStatus
  progress: number
  analyzing: boolean
}) {
  return (
    <div className="status">
      <span className={`dot ${status}`} />
      {status === "loading" && (
        <span>Laddar svensk AI-modell… {progress}% · regler skyddar redan</span>
      )}
      {status === "ready" && (
        <span>
          Svensk AI-modell aktiv{analyzing ? " · analyserar…" : " · fångar namn & platser"}
        </span>
      )}
      {status === "error" && <span>AI-modell kunde inte laddas · regler skyddar</span>}
    </div>
  )
}

export function Controls({
  activeId,
  onPick,
  status,
  progress,
  analyzing,
}: {
  activeId: string
  onPick: (s: Scenario) => void
  status: NerStatus
  progress: number
  analyzing: boolean
}) {
  return (
    <div className="controls">
      <div className="tabs">
        {scenarios.map((s) => {
          const Icon = DOMAIN_ICONS[s.id]
          return (
            <button
              type="button"
              key={s.id}
              className={`tab ${s.id === activeId ? "on" : ""}`}
              onClick={() => onPick(s)}
            >
              {Icon && <Icon size={14} />}
              {s.name}
            </button>
          )
        })}
      </div>
      <ModelStatus status={status} progress={progress} analyzing={analyzing} />
    </div>
  )
}
