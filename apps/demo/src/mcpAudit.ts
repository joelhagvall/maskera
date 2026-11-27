// The @maskera/mcp production audit, read straight from the evidence file that
// `pnpm audit:evidence` writes (packages/mcp/audit-results.json), so no audit
// number on the site is typed by hand. `pnpm release` refuses to publish
// unless that file is a passing --release run of the version being released.

import {
  commitSha,
  model,
  packageVersion,
  releaseGates,
  suites,
  timestamp,
} from "../../../packages/mcp/audit-results.json"

/**
 * The gates the site shows. The production-pipeline quality and performance
 * gates are left out: they run on a small corpus the author wrote, and the
 * site shows accuracy only on independent text (the accuracy page).
 */
export const PUBLIC_GATES = [
  "zero-canary-leaks",
  "security-invariants",
  "mutation-detection",
  "protocol-conformance",
  "adversarial-regression",
  "clean-package-install",
  "offline-operation",
  "real-client-e2e",
] as const
export type PublicGateId = (typeof PUBLIC_GATES)[number]

export type CheckStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED"
export type Verdict = "PRODUCTION READY" | "CONDITIONALLY READY" | "NOT READY"

/** The real CLI agents the clients suite drives, in the order the page names them. */
export const AUDITED_CLIENTS = ["claude", "codex", "opencode"] as const
export type AuditedClient = (typeof AUDITED_CLIENTS)[number]

interface Check {
  id: string
  status: string
}
interface Suite {
  suite: string
  checks: Check[]
  metrics: Record<string, unknown>
}

const bySuite = Object.fromEntries((suites as Suite[]).map((s) => [s.suite, s]))

function metric(suite: string, key: string): number {
  const value = bySuite[suite]?.metrics[key]
  if (typeof value !== "number") throw new Error(`audit-results.json has no ${suite}.${key}`)
  return value
}

export const auditRun = {
  date: timestamp.slice(0, 10),
  packageVersion,
  modelRevision: model.revision,
  commit: commitSha.slice(0, 12),
  verdict: releaseGates.verdict as Verdict,
  release: releaseGates.release === true,
}

export const auditFigures = {
  canaryLeaks: metric("privacy", "canaryLeaks"),
  canaryTypes: metric("privacy", "canariesTracked"),
  surfaces: metric("privacy", "surfacesChecked"),
  mutationsTotal: metric("security", "mutationsTotal"),
  mutationsKilled: metric("security", "mutationsTotal") - metric("security", "mutationsSurvived"),
  crossSessionLeaks: metric("security", "crossSessionLeaks"),
  failOpenIncidents: metric("security", "failOpenIncidents"),
  offlineEgress: metric("offline", "unexpectedEgressAttempts"),
}

const gateStatus = Object.fromEntries(
  releaseGates.gates.map((g) => [g.id, g.status as CheckStatus]),
) as Record<string, CheckStatus>

export const publicGates = PUBLIC_GATES.map((id) => {
  const status = gateStatus[id]
  if (!status) throw new Error(`audit-results.json has no ${id} gate`)
  return { id, status }
})

const clientsSuite = bySuite.clients
export const auditedClients = AUDITED_CLIENTS.filter((name) =>
  ((clientsSuite?.metrics.availableCliClients as string[] | undefined) ?? []).includes(name),
)
export const localModelTested =
  clientsSuite?.checks.some((c) => c.id === "local-llm-ollama" && c.status === "PASS") ?? false

/** Every check of the run that did not pass (the page labels each id). */
export const openChecks = (suites as Suite[]).flatMap((s) =>
  s.checks
    .filter((c) => c.status !== "PASS")
    .map((c) => ({ id: c.id, status: c.status as CheckStatus })),
)
