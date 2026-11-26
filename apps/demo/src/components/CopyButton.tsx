import { type ReactNode, useEffect, useRef, useState } from "react"
import strings from "../i18n"
import { CheckIcon, CopyIcon } from "../icons"

/**
 * Copy-to-clipboard button with the shared copied-state machinery. The base
 * className gets " copied" appended while the confirmation shows.
 */
export function CopyButton({
  text,
  className,
  iconSize = 13,
  iconPosition = "start",
  leading,
  ariaLabel,
  title,
  label,
  copiedLabel,
}: {
  text: string
  className: string
  iconSize?: number
  iconPosition?: "start" | "end"
  leading?: ReactNode
  ariaLabel?: string
  title?: string
  label?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return // clipboard unavailable (permissions/insecure context): keep quiet
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }

  const idleText = label ?? strings.copyButton.copy
  const doneText = copiedLabel ?? strings.copyButton.copied
  const icon = copied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />

  return (
    <button
      type="button"
      className={`${className}${copied ? " copied" : ""}`}
      onClick={copy}
      aria-label={ariaLabel ? (copied ? doneText : ariaLabel) : undefined}
      title={title}
    >
      {leading}
      {iconPosition === "start" ? icon : null}
      <span aria-live="polite">{copied ? doneText : idleText}</span>
      {iconPosition === "end" ? icon : null}
    </button>
  )
}
