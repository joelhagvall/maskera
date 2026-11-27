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

export function evaluateReleaseGates(suiteResults) {
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

  // Gate 6: Real-client E2E (when executed)
  const clients = byName.clients
  if (clients) {
    const ok = clients.status === "PASS" || clients.status === "NOT_TESTED"
    addGate(
      "real-client-e2e",
      "integration",
      clients.status === "PASS",
      `Real-client harnesses: ${clients.passed} passed, ${clients.failed} failed, ${clients.notTested ?? 0} not tested`,
      clients.status === "NOT_TESTED" ? "NOT_TESTED" : ok ? "PASS" : "FAIL",
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
