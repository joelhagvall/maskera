import { useCallback, useEffect, useState } from "react"

/** How long each hero scene shows before the next one fades in. */
export const AUTO_ADVANCE_MS = 7000

function matches(query: string): boolean {
  return typeof matchMedia === "function" && matchMedia(query).matches
}

/**
 * A rotating index for a small set of scenes, with the controls WCAG 2.2.2
 * asks of moving content: it pauses while the visitor hovers or focuses the
 * scenes (`hold`), stops for good when they pick a scene or press pause, and
 * never starts for visitors who prefer reduced motion or on screens matching
 * `stillOn` (where a switch would move the page). Starts at 0 on the server
 * and the first client render, so hydration matches.
 */
export function useAutoAdvance(
  count: number,
  { stillOn, intervalMs = AUTO_ADVANCE_MS }: { stillOn?: string; intervalMs?: number } = {},
) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    setPlaying(!matches("(prefers-reduced-motion: reduce)") && !(stillOn && matches(stillOn)))
  }, [stillOn])

  useEffect(() => {
    if (!playing || held || count < 2) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs)
    return () => clearInterval(timer)
  }, [playing, held, count, intervalMs])

  /** The visitor picked a scene: show it and stop rotating. */
  const select = useCallback((i: number) => {
    setIndex(i)
    setPlaying(false)
  }, [])

  const toggle = useCallback(() => setPlaying((p) => !p), [])

  return { index, select, playing, toggle, hold: setHeld }
}
