import copy from "../i18n"
import { DOMAIN_ICONS } from "../icons"
import { getScenarios, type Scenario } from "../scenarios"
import type { NerStatus } from "../useSwedishNer"

function ModelStatus({
  status,
  progress,
  analyzing,
  onRetryModel,
}: {
  status: NerStatus
  progress: number
  analyzing: boolean
  onRetryModel: () => void
}) {
  if (status === "idle") {
    return (
      <div className="model-status-group">
        <div className="status model-idle" role="status" aria-live="polite">
          <span className="dot idle" aria-hidden="true" />
          <span>{copy.controls.modelStarting}</span>
        </div>
        <p className="model-download-note">{copy.controls.modelDownloadNote}</p>
      </div>
    )
  }

  if (status === "loading") {
    // Past 100% the download is done but the WASM runtime is still starting
    // up, a phase with no progress events until "ready". Name that phase
    // instead of sitting on a frozen "100%".
    const starting = progress >= 100
    return (
      <div className="model-status-group">
        <div className="status" role="status" aria-live="polite" aria-atomic="true">
          <span
            className="bar"
            role="progressbar"
            aria-label={copy.controls.modelLoadingAria}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span
              className={`bar-fill${starting ? " starting" : ""}`}
              style={{ width: `${Math.max(progress, 3)}%` }}
            />
          </span>
          {starting ? (
            <span>{copy.controls.modelStarting}</span>
          ) : (
            <span>
              {copy.controls.modelLoading} <span className="pct">{progress}%</span>
            </span>
          )}
        </div>
        <p className="model-download-note">{copy.controls.modelDownloadNote}</p>
      </div>
    )
  }
  if (status === "error") {
    return (
      <div className="status model-error">
        <span className="dot error" aria-hidden="true" />
        <span role="status" aria-live="polite">
          {copy.controls.modelError}
        </span>
        <button type="button" className="model-action" onClick={onRetryModel}>
          {copy.controls.modelRetry}
        </button>
      </div>
    )
  }

  return (
    <div className="status" role="status" aria-live="polite" aria-atomic="true">
      {/* The output card shows "analyserar…" while typing; here the pulsing
          dot is the only activity signal, so the row keeps a stable width. */}
      <span className={`dot ready${analyzing ? " analyzing" : ""}`} aria-hidden="true" />
      <span>{copy.controls.modelReady}</span>
    </div>
  )
}

export function Controls({
  activeId,
  onPick,
  status,
  progress,
  analyzing,
  onRetryModel,
}: {
  activeId: string
  onPick: (s: Scenario) => void
  status: NerStatus
  progress: number
  analyzing: boolean
  onRetryModel: () => void
}) {
  const scenarios = getScenarios()

  return (
    <div className="controls">
      <div className="tabs" role="group" aria-labelledby="scenario-label">
        <span className="tabs-label" id="scenario-label">
          {copy.controls.examplesLabel}
        </span>
        {scenarios.map((s) => {
          const Icon = DOMAIN_ICONS[s.id]
          const own = s.id === "fritext"
          return (
            <span key={s.id} className="tab-item">
              {own && <span className="tab-divider" aria-hidden="true" />}
              <button
                type="button"
                className={`tab ${own ? "tab-own" : ""} ${s.id === activeId ? "on" : ""}`}
                aria-pressed={s.id === activeId}
                onClick={() => onPick(s)}
              >
                {Icon && <Icon size={14} />}
                {s.name}
              </button>
            </span>
          )
        })}
      </div>
      <ModelStatus
        status={status}
        progress={progress}
        analyzing={analyzing}
        onRetryModel={onRetryModel}
      />
    </div>
  )
}
