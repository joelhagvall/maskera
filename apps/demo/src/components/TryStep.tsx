import type { ReactNode } from "react"

/**
 * One numbered step of the home demo (you write, the AI sees, the reply comes
 * back): the number and a muted label on one line with an optional action on
 * the right, then the step's content. No frame or fill, hairlines between steps only.
 */
export function TryStep({
  n,
  label,
  action,
  children,
}: {
  n: number
  label: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <li className="try-step">
      <div className="try-head">
        <span className="try-label">
          <span className="try-num" aria-hidden="true">
            {n}
          </span>
          {label}
        </span>
        {action ? <span className="try-action">{action}</span> : null}
      </div>
      {children}
    </li>
  )
}
