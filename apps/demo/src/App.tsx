import { useCallback, useEffect, useState } from "react"
import { Footer } from "./components/Footer"
import copy from "./i18n"
import { useRoute, type View } from "./routing"
import { getLoadedView, loadView } from "./views"

// initialView is the build-time prerender's route (entry-server.tsx); the
// browser leaves it undefined and derives the view from the URL as before.
export function App({ initialView }: { initialView?: View }) {
  const [anchor, setAnchor] = useState<string | null>(null)
  const [requestedScenarioId, setRequestedScenarioId] = useState<string | null>(null)
  const [, setLoadedTick] = useState(0)
  const { view, navigate } = useRoute(initialView)

  // If browser history (popstate) lands on a route whose chunk has not been
  // loaded yet, fetch it on demand and rerender once ready.
  useEffect(() => {
    if (getLoadedView(view)) return
    let active = true
    void loadView(view).then(() => {
      if (active) setLoadedTick((n) => n + 1)
    })
    return () => {
      active = false
    }
  }, [view])

  // Jump to the requested section (e.g. the footer's "Integritetspolicy"
  // link) as soon as it is set, not on view change: navigate() is a no-op
  // when the target view is already active, and the jump must work then too.
  useEffect(() => {
    if (!anchor || !getLoadedView(view)) return
    document.getElementById(anchor)?.scrollIntoView()
    setAnchor(null)
  }, [anchor, view])

  const consumeRequestedScenario = useCallback(() => {
    setRequestedScenarioId(null)
  }, [])

  // Preload the destination chunk before committing pushState so in-app view
  // transitions never flash a blank screen.
  const go = useCallback(
    (next: View, options?: { skipScrollRestoration?: boolean }) => {
      if (getLoadedView(next)) {
        navigate(next, options)
        return
      }
      void loadView(next).then(() => {
        navigate(next, options)
      })
    },
    [navigate],
  )

  const goCoverage = useCallback(() => {
    setAnchor("vad-maskeras")
    go("transparency", { skipScrollRestoration: true })
  }, [go])

  const goContextDemo = useCallback(() => {
    setRequestedScenarioId("kontext")
    go("demo")
  }, [go])

  const DemoView = view === "demo" ? getLoadedView("demo") : undefined
  const DevView = view === "dev" ? getLoadedView("dev") : undefined
  const TransparencyView = view === "transparency" ? getLoadedView("transparency") : undefined
  const TestDataView = view === "testdata" ? getLoadedView("testdata") : undefined
  const PrivacyView = view === "privacy" ? getLoadedView("privacy") : undefined
  const ServicesView = view === "services" ? getLoadedView("services") : undefined
  const AccuracyView = view === "accuracy" ? getLoadedView("accuracy") : undefined
  const SecurityView = view === "security" ? getLoadedView("security") : undefined
  const AboutView = view === "about" ? getLoadedView("about") : undefined

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        {copy.demo.skipLink}
      </a>
      {DemoView && (
        <DemoView
          go={go}
          onCoverage={goCoverage}
          requestedScenarioId={requestedScenarioId}
          onRequestedScenarioConsumed={consumeRequestedScenario}
        />
      )}
      {DevView && <DevView go={go} onCoverage={goCoverage} />}
      {TransparencyView && <TransparencyView go={go} />}
      {TestDataView && <TestDataView go={go} />}
      {PrivacyView && <PrivacyView go={go} />}
      {ServicesView && <ServicesView go={go} onCoverage={goCoverage} />}
      {AccuracyView && <AccuracyView go={go} onTryContext={goContextDemo} />}
      {SecurityView && <SecurityView go={go} />}
      {AboutView && <AboutView go={go} />}
      <Footer
        onServices={() => go("services")}
        onDevelopers={() => go("dev")}
        onTransparency={() => go("transparency")}
        onTestData={() => go("testdata")}
        onPolicy={() => go("privacy")}
        onAccuracy={() => go("accuracy")}
        onSecurity={() => go("security")}
        onAbout={() => go("about")}
      />
    </div>
  )
}
