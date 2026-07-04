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
  if (status === "loading") {
    return (
      <div className="status">
        {/* Decorative: the sibling text carries the same progress information. */}
        <span className="bar" aria-hidden="true">
          <span className="bar-fill" style={{ width: `${Math.max(progress, 3)}%` }} />
        </span>
        <span>
          Laddar maskeras AI-modell… <span className="pct">{progress}%</span>
        </span>
      </div>
    )
  }
  return (
    <div className="status">
      <span className={`dot ${status}${analyzing ? " analyzing" : ""}`} aria-hidden="true" />
      {status === "ready" && (
        <span>maskeras AI-modell aktiv</span>
      )}
      {status === "error" && <span>AI-modellen kunde inte laddas</span>}
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
        <span className="tabs-label">Testa ett exempel:</span>
        {scenarios.map((s) => {
          const Icon = DOMAIN_ICONS[s.id]
          const own = s.id === "fritext"
          return (
            <span key={s.id} className="tab-item">
              {own && <span className="tab-divider" aria-hidden="true" />}
              <button
                type="button"
                className={`tab ${own ? "tab-own" : ""} ${s.id === activeId ? "on" : ""}`}
                onClick={() => onPick(s)}
              >
                {Icon && <Icon size={14} />}
                {s.name}
              </button>
            </span>
          )
        })}
      </div>
      <ModelStatus status={status} progress={progress} analyzing={analyzing} />
    </div>
  )
}
