/**
 * Deterministic Release Gates for `@maskera/mcp`.
 *
 * Strictly separates deterministic security invariants (which must be 0/0
 * failures) from probabilistic NER quality floors (which are empirical
 * baselines, never mathematical guarantees against every future PII string).
 */

export const RELEASE_GATE_THRESHOLDS = {
  // Deterministic security invariants (zero tolerance)
  maxCanaryLeaks: 0,
  maxCrossSessionLeaks: 0,
  maxFailOpenIncidents: 0,
  maxSurvivingMutations: 0,
  maxCriticalOrHighSecurityFailures: 0,
  requireCleanPackageInstall: true,
  requireOfflineModePass: true,

  // Probabilistic production-pipeline NER quality floors on unseen Swedish corpus
  // (derived from baseline v20 measurements through live MCP + proxy; separate from
  // deterministic security guarantees).
  minStructuredRecall: 0.98,
  minOverallEntityRecall: 0.9,
  minRoundtripRestorationAccuracy: 1.0,
  minProtectedNonPiiRetention: 0.85,

  // Performance & reliability ceilings (Apple Silicon / CI Ubuntu safe ceilings)
  maxCliColdStartMs: 2500,
  maxStreamingRestorer10kChunksMs: 250,
  maxSoakHeapGrowthMb: 120,
}

/** The real CLI agents the clients suite drives; `--release` requires every one. */
export const REAL_CLI_CLIENTS = ["claude", "codex", "opencode"]

/** The clients-suite check that drives real installed CLI agents over the packed tarball. */
export const REAL_CLI_CLIENTS_CHECK_ID = "real-cli-harnesses-installed-artifact"

/**
 * Every gate and the suite that feeds it. A lane that skips a suite reports
 * that gate as NOT_TESTED instead of leaving it out, so a partial lane can
 * never read as PRODUCTION READY.
 */
export const RELEASE_GATE_SUITES = {
  "zero-canary-leaks": "privacy",
  "security-invariants": "security",
  "mutation-detection": "security",
  "protocol-conformance": "protocol",
  "adversarial-regression": "adversarial",
  "clean-package-install": "package",
  "offline-operation": "offline",
  "real-client-e2e": "clients",
  "production-pipeline-quality": "benchmark",
  "performance-and-soak": "benchmark",
}

/**
 * `release: true` is the npm publish gate (`pnpm release` runs it): every gate
 * must PASS, a NOT_TESTED gate fails, and the real-client gate needs every
 * agent in REAL_CLI_CLIENTS to have run, not only the local Ollama check.
 */
export function evaluateReleaseGates(suiteResults, { release = false } = {}) {
  const gates = []
  const byName = Object.fromEntries(suiteResults.map((s) => [s.suite, s]))

  const addGate = (id, category, passed, detail, status = passed ? "PASS" : "FAIL") => {
    gates.push({ id, category, status, passed, detail })
  }

  // Gate 1: Zero raw canary leaks outside trust boundaries
  const privacy = byName.privacy
  if (!privacy) {
    addGate(
      "zero-canary-leaks",
      "deterministic-security",
      false,
      "privacy suite did not run",
      "NOT_TESTED",
    )
  } else {
    const leaks = privacy.metrics?.canaryLeaks ?? -1
    const ok = privacy.status === "PASS" && leaks === 0
    addGate(
      "zero-canary-leaks",
      "deterministic-security",
      ok,
      `Observed ${leaks} raw canary leak(s) across ${privacy.metrics?.surfacesChecked ?? 0} surfaces (max ${RELEASE_GATE_THRESHOLDS.maxCanaryLeaks})`,
    )
  }

  // Gate 2: Zero cross-session leakage & zero silent fail-open behavior & mutation kills
  const security = byName.security
  if (!security) {
    addGate(
      "security-invariants",
      "deterministic-security",
      false,
      "security suite did not run",
      "NOT_TESTED",
    )
    addGate(
      "mutation-detection",
      "deterministic-security",
      false,
      "security suite did not run",
      "NOT_TESTED",
    )
  } else {
    const crossLeaks = security.metrics?.crossSessionLeaks ?? -1
    const failOpens = security.metrics?.failOpenIncidents ?? -1
    const okSec =
      security.status === "PASS" &&
      crossLeaks <= RELEASE_GATE_THRESHOLDS.maxCrossSessionLeaks &&
      failOpens <= RELEASE_GATE_THRESHOLDS.maxFailOpenIncidents
    addGate(
      "security-invariants",
      "deterministic-security",
      okSec,
      `crossSessionLeaks=${crossLeaks}, failOpenIncidents=${failOpens}, failedChecks=${security.failed ?? 0}`,
    )

    const survived = security.metrics?.mutationsSurvived ?? -1
    const totalMut = security.metrics?.mutationsTotal ?? 0
    const okMut = totalMut >= 4 && survived <= RELEASE_GATE_THRESHOLDS.maxSurvivingMutations
    addGate(
      "mutation-detection",
      "deterministic-security",
      okMut,
      `Killed ${totalMut - survived}/${totalMut} planted security mutations (max surviving ${RELEASE_GATE_THRESHOLDS.maxSurvivingMutations})`,
    )
  }

  // Gate 3: Protocol conformance & adversarial regression
  const protocol = byName.protocol
  if (protocol) {
    addGate(
      "protocol-conformance",
      "deterministic-correctness",
      protocol.status === "PASS",
      `MCP protocol checks: ${protocol.passed}/${protocol.total} passed`,
    )
  }

  const adversarial = byName.adversarial
  if (adversarial) {
    addGate(
      "adversarial-regression",
      "deterministic-security",
      adversarial.status === "PASS",
      `Adversarial & fuzz checks: ${adversarial.passed}/${adversarial.total} passed`,
    )
  }

  // Gate 4: Clean package install & supply chain
  const pkg = byName.package
  if (pkg) {
    addGate(
      "clean-package-install",
      "supply-chain",
      pkg.status === "PASS",
      `Packed tarball install & contents check: ${pkg.passed}/${pkg.total} passed`,
    )
  }

  // Gate 5: Offline verification
  const offline = byName.offline
  if (offline) {
    addGate(
      "offline-operation",
      "privacy-egress",
      offline.status === "PASS",
      `Offline egress attempts blocked: ${offline.metrics?.unexpectedEgressAttempts ?? 0} unexpected outbound connections`,
    )
  }

  // Gate 6: Real-client E2E. Only the real CLI agents over the installed
  // tarball count as tested; a passing Ollama check alone does not.
  const clients = byName.clients
  if (clients) {
    const realCli = clients.checks?.find((c) => c.id === REAL_CLI_CLIENTS_CHECK_ID)
    const ran = clients.metrics?.availableCliClients ?? []
    const missing = REAL_CLI_CLIENTS.filter((name) => !ran.includes(name))
    let status = "NOT_TESTED"
    if (clients.failed > 0 || realCli?.status === "FAIL") status = "FAIL"
    else if (realCli?.status === "PASS") status = release && missing.length > 0 ? "FAIL" : "PASS"
    addGate(
      "real-client-e2e",
      "integration",
      status === "PASS",
      `Real-client harnesses: ${clients.passed} passed, ${clients.failed} failed, ${clients.notTested ?? 0} not tested; real CLI agents: ${realCli?.status ?? "NOT_RUN"} (${ran.join(", ") || "none"}${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""})`,
      status,
    )
  }

  // Gate 7: Production-pipeline NER quality & performance floors (probabilistic + perf)
  const bench = byName.benchmark
  if (bench) {
    const m = bench.metrics ?? {}
    const qualityOk =
      (m.structuredRecall ?? 0) >= RELEASE_GATE_THRESHOLDS.minStructuredRecall &&
      (m.overallRecall ?? 0) >= RELEASE_GATE_THRESHOLDS.minOverallEntityRecall &&
      (m.roundtripAccuracy ?? 0) >= RELEASE_GATE_THRESHOLDS.minRoundtripRestorationAccuracy &&
      (m.nonPiiRetention ?? 0) >= RELEASE_GATE_THRESHOLDS.minProtectedNonPiiRetention
    addGate(
      "production-pipeline-quality",
      "probabilistic-ner-baseline",
      qualityOk,
      `structuredRecall=${((m.structuredRecall ?? 0) * 100).toFixed(1)}%, overallRecall=${((m.overallRecall ?? 0) * 100).toFixed(1)}%, roundtrip=${((m.roundtripAccuracy ?? 0) * 100).toFixed(1)}%, nonPiiRetention=${((m.nonPiiRetention ?? 0) * 100).toFixed(1)}%`,
    )
    const perfOk =
      bench.status === "PASS" &&
      (m.cliColdStartMs ?? Infinity) <= RELEASE_GATE_THRESHOLDS.maxCliColdStartMs &&
      (m.soakHeapGrowthMb ?? Infinity) <= RELEASE_GATE_THRESHOLDS.maxSoakHeapGrowthMb
    addGate(
      "performance-and-soak",
      "reliability",
      perfOk,
      `coldStart=${m.cliColdStartMs ?? "?"}ms, proxyP95=${m.proxyP95Ms ?? "?"}ms, soakHeapDelta=${m.soakHeapGrowthMb ?? "?"}MB`,
    )
  }

  for (const [id, suite] of Object.entries(RELEASE_GATE_SUITES)) {
    if (!gates.some((g) => g.id === id)) {
      gates.push({
        id,
        category: "not-run",
        status: "NOT_TESTED",
        passed: false,
        detail: `${suite} suite did not run in this lane`,
      })
    }
  }

  if (release) {
    for (const g of gates) {
      if (g.status !== "PASS") {
        g.detail = `${g.detail} (release requires PASS, was ${g.status})`
        g.status = "FAIL"
        g.passed = false
      }
    }
  }

  const failedGates = gates.filter((g) => g.status === "FAIL")
  const notTestedGates = gates.filter((g) => g.status === "NOT_TESTED")
  const totalNotTestedChecks = suiteResults.reduce((sum, s) => sum + (s.notTested ?? 0), 0)
  const passed = failedGates.length === 0

  let verdict = "PRODUCTION READY"
  if (failedGates.length > 0) {
    verdict = "NOT READY"
  } else if (notTestedGates.length > 0 || totalNotTestedChecks > 0) {
    verdict = "CONDITIONALLY READY"
  }

  return {
    passed,
    verdict,
    release,
    thresholds: RELEASE_GATE_THRESHOLDS,
    summary: {
      total: gates.length,
      pass: gates.filter((g) => g.status === "PASS").length,
      fail: failedGates.length,
      notTested: notTestedGates.length,
    },
    gates,
  }
}
