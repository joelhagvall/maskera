import { useEffect, useState } from "react"

/**
 * The index of a small auto-advancing set (the hero scenes, the install-page
 * flow steps). One owner for the timer so every rotating block behaves the
 * same:
 * - it advances every `intervalMs` while neither paused nor held;
 * - `paused` is the visitor's explicit choice (the Pause/Play button, or
 *   picking an item), and starts true under prefers-reduced-motion
 *   (WCAG 2.2.2: moving content that runs longer than five seconds needs a
 *   way to stop it);
 * - `held` is a temporary stop while the pointer or focus is on the block,
 *   which does not change the Pause/Play label.
 */
export function useRotation(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setPaused(true)
    }
  }, [])

  useEffect(() => {
    if (paused || held || length < 2) return
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [paused, held, length, intervalMs])

  return { index, setIndex, paused, setPaused, setHeld }
}
