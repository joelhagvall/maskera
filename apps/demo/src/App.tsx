import { useCallback, useEffect, useState } from "react"
import { Footer } from "./components/Footer"
import copy from "./i18n"
import { useRoute, type View } from "./routing"
import { getLoadedView, loadView } from "./views"

// initialView is the build-time prerender's route (entry-server.tsx); the
// browser leaves it undefined and derives the view from the URL as before.
export function App({ initialView }: { initialView?: View }) {
  // The section to jump to and the page it is on. Keyed by page, so a jump
  // waits until that page is shown instead of firing on the page being left
  // while the next page's chunk still loads.
  const [anchor, setAnchor] = useState<{ view: View; id: string } | null>(null)
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
    if (!anchor || anchor.view !== view || !getLoadedView(view)) return
    document.getElementById(anchor.id)?.scrollIntoView()
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

  // Navigate to a section on another page: the anchor effect above scrolls
  // to it once the page is rendered.
  const goSection = useCallback(
    (next: View, id: string) => {
      setAnchor({ view: next, id })
      go(next, { skipScrollRestoration: true })
    },
    [go],
  )

  const goCoverage = useCallback(() => goSection("transparency", "vad-maskeras"), [goSection])

  // Open the home demo on one example (a scenario id from copy.scenarios).
  const goScenario = useCallback(
    (id: string) => {
      setRequestedScenarioId(id)
      go("demo")
    },
    [go],
  )
  const goContextDemo = useCallback(() => goScenario("kontext"), [goScenario])

  const DemoView = view === "demo" ? getLoadedView("demo") : undefined
  const DevView = view === "dev" ? getLoadedView("dev") : undefined
  const DocsView = view === "docs" ? getLoadedView("docs") : undefined
  const DocsMcpView = view === "docsMcp" ? getLoadedView("docsMcp") : undefined
  const DocsClientsView = view === "docsClients" ? getLoadedView("docsClients") : undefined
  const DocsSdkView = view === "docsSdk" ? getLoadedView("docsSdk") : undefined
  const DocsTroubleshootingView =
    view === "docsTroubleshooting" ? getLoadedView("docsTroubleshooting") : undefined
  const TransparencyView = view === "transparency" ? getLoadedView("transparency") : undefined
  const TestDataView = view === "testdata" ? getLoadedView("testdata") : undefined
  const PrivacyView = view === "privacy" ? getLoadedView("privacy") : undefined
  const ServicesView = view === "services" ? getLoadedView("services") : undefined
  const AccuracyView = view === "accuracy" ? getLoadedView("accuracy") : undefined
  const SecurityView = view === "security" ? getLoadedView("security") : undefined
  const AboutView = view === "about" ? getLoadedView("about") : undefined
  const FaqView = view === "faq" ? getLoadedView("faq") : undefined
  const GuidesView = view === "guides" ? getLoadedView("guides") : undefined
  const IndustriesView = view === "industries" ? getLoadedView("industries") : undefined

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        {copy.demo.skipLink}
      </a>
      {DemoView && (
        <DemoView
          go={go}
          goSection={goSection}
          onCoverage={goCoverage}
          requestedScenarioId={requestedScenarioId}
          onRequestedScenarioConsumed={consumeRequestedScenario}
        />
      )}
      {DevView && <DevView go={go} goSection={goSection} onCoverage={goCoverage} />}
      {DocsView && <DocsView go={go} onCoverage={goCoverage} />}
      {DocsMcpView && <DocsMcpView go={go} />}
      {DocsClientsView && <DocsClientsView go={go} />}
      {DocsSdkView && <DocsSdkView go={go} />}
      {DocsTroubleshootingView && <DocsTroubleshootingView go={go} />}
      {TransparencyView && <TransparencyView go={go} />}
      {TestDataView && <TestDataView go={go} />}
      {PrivacyView && <PrivacyView go={go} />}
      {ServicesView && <ServicesView go={go} goSection={goSection} onCoverage={goCoverage} />}
      {AccuracyView && <AccuracyView go={go} onTryContext={goContextDemo} />}
      {SecurityView && <SecurityView go={go} />}
      {AboutView && <AboutView go={go} />}
      {FaqView && <FaqView go={go} />}
      {GuidesView && <GuidesView go={go} goSection={goSection} />}
      {IndustriesView && <IndustriesView go={go} onTryScenario={goScenario} />}
      <Footer go={go} />
    </div>
  )
}
