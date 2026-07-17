import { lazy, Suspense, useEffect, useState } from "react"

const Analytics = lazy(() =>
  import("@vercel/analytics/react").then((module) => ({ default: module.Analytics })),
)

/** Loads analytics after the app is interactive; it is never part of the critical bundle. */
export function DeferredAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Vercel's script only exists on a deployment. Avoid a guaranteed 404 in
    // local production previews (including Lighthouse and offline use).
    if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return

    const enable = () => setEnabled(true)

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(enable, { timeout: 2000 })
      return () => cancelIdleCallback(id)
    }

    const id = setTimeout(enable, 0)
    return () => clearTimeout(id)
  }, [])

  return enabled ? (
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
  ) : null
}
