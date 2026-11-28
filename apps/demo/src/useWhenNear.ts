import { useCallback } from "react"

/**
 * A ref callback that calls `onNear` once, the first time the element comes
 * within `rootMargin` of the viewport. The home demo uses it to start the
 * 40 MB model download only for visitors who scroll towards the demo, not
 * for everyone who opens the home page. Without IntersectionObserver (old
 * browsers, jsdom) it calls `onNear` right away, the previous behaviour.
 * Pass a stable `onNear` (useCallback), or the observer is recreated on
 * every render.
 */
export function useWhenNear(onNear: () => void, rootMargin: string) {
  return useCallback(
    (element: Element | null) => {
      if (!element) return
      if (typeof IntersectionObserver === "undefined") {
        onNear()
        return
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return
          observer.disconnect()
          onNear()
        },
        { rootMargin },
      )
      observer.observe(element)
      return () => observer.disconnect()
    },
    [onNear, rootMargin],
  )
}
