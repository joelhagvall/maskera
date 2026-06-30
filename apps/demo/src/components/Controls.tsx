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
      {status === "loading" && <span>Laddar modell {progress}% · regler aktiva</span>}
      {status === "ready" && <span>Svensk modell aktiv{analyzing ? " · analyserar" : ""}</span>}
      {status === "error" && <span>Modell ej laddad · regler aktiva</span>}
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
        {scenarios.map((s) => (
          <button
            type="button"
            key={s.id}
            className={`tab ${s.id === activeId ? "on" : ""}`}
            onClick={() => onPick(s)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <ModelStatus status={status} progress={progress} analyzing={analyzing} />
    </div>
  )
}
