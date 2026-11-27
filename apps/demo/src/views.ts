import type { FunctionComponent } from "react"
import type { DemoWorkspaceProps } from "./components/DemoWorkspace"
import type { View } from "./routing"

export interface ViewComponents {
  demo: FunctionComponent<DemoWorkspaceProps>
  dev: FunctionComponent<{
    go: (next: View) => void
    goSection?: (next: View, id: string) => void
    onCoverage: () => void
  }>
  docs: FunctionComponent<{ go: (next: View) => void; onCoverage: () => void }>
  docsMcp: FunctionComponent<{ go: (next: View) => void }>
  docsClients: FunctionComponent<{ go: (next: View) => void }>
  docsSdk: FunctionComponent<{ go: (next: View) => void }>
  docsTroubleshooting: FunctionComponent<{ go: (next: View) => void }>
  transparency: FunctionComponent<{ go: (next: View) => void }>
  testdata: FunctionComponent<{ go: (next: View) => void }>
  privacy: FunctionComponent<{ go: (next: View) => void }>
  services: FunctionComponent<{
    go: (next: View) => void
    goSection: (next: View, id: string) => void
    onCoverage: () => void
  }>
  accuracy: FunctionComponent<{ go: (next: View) => void; onTryContext?: () => void }>
  security: FunctionComponent<{ go: (next: View) => void }>
  about: FunctionComponent<{ go: (next: View) => void }>
  faq: FunctionComponent<{ go: (next: View) => void }>
  guides: FunctionComponent<{
    go: (next: View) => void
    goSection?: (next: View, id: string) => void
  }>
  industries: FunctionComponent<{ go: (next: View) => void; onTryScenario: (id: string) => void }>
}

const loaded: Partial<ViewComponents> = {}
const inflight: Partial<Record<View, Promise<unknown>>> = {}

const importers: { [K in View]: () => Promise<ViewComponents[K]> } = {
  demo: () => import("./components/DemoWorkspace").then((m) => m.DemoWorkspace),
  dev: () => import("./components/Developers").then((m) => m.Developers),
  docs: () => import("./components/Docs").then((m) => m.DocsOverview),
  docsMcp: () => import("./components/Docs").then((m) => m.DocsMcp),
  docsClients: () => import("./components/Docs").then((m) => m.DocsClients),
  docsSdk: () => import("./components/Docs").then((m) => m.DocsSdk),
  docsTroubleshooting: () => import("./components/Docs").then((m) => m.DocsTroubleshooting),
  transparency: () => import("./components/Transparency").then((m) => m.Transparency),
  testdata: () => import("./components/TestData").then((m) => m.TestData),
  privacy: () => import("./components/PrivacyPolicy").then((m) => m.PrivacyPolicy),
  services: () => import("./components/Services").then((m) => m.Services),
  accuracy: () => import("./components/Accuracy").then((m) => m.Accuracy),
  security: () => import("./components/Security").then((m) => m.Security),
  about: () => import("./components/About").then((m) => m.About),
  faq: () => import("./components/Faq").then((m) => m.Faq),
  guides: () => import("./components/Guides").then((m) => m.Guides),
  industries: () => import("./components/Industries").then((m) => m.Industries),
}

export function loadView<K extends View>(view: K): Promise<ViewComponents[K]> {
  const existing = loaded[view]
  if (existing) return Promise.resolve(existing)
  const pending = inflight[view] as Promise<ViewComponents[K]> | undefined
  if (pending) return pending
  const request = importers[view]().then((component) => {
    loaded[view] = component
    delete inflight[view]
    return component
  })
  inflight[view] = request
  return request
}

export function registerViews(components: Partial<ViewComponents>) {
  Object.assign(loaded, components)
}

export function getLoadedView<K extends View>(view: K): ViewComponents[K] | undefined {
  return loaded[view]
}
