import assert from "node:assert/strict"
import test from "node:test"
import {
  evaluateReleaseGates,
  REAL_CLI_CLIENTS,
  REAL_CLI_CLIENTS_CHECK_ID,
  RELEASE_GATE_SUITES,
} from "./gates.mjs"

const check = (id, status) => ({ id, status })

function suite(name, checks, metrics = {}) {
  const count = (status) => checks.filter((c) => c.status === status).length
  const passed = count("PASS")
  return {
    suite: name,
    status: count("FAIL") > 0 ? "FAIL" : passed === 0 ? "NOT_TESTED" : "PASS",
    total: checks.length,
    passed,
    failed: count("FAIL"),
    blocked: 0,
    notTested: count("NOT_TESTED"),
    checks,
    metrics,
  }
}

const clientsWith = (realCliStatus, availableCliClients = REAL_CLI_CLIENTS) =>
  suite(
    "clients",
    [
      check(REAL_CLI_CLIENTS_CHECK_ID, realCliStatus),
      check("local-llm-ollama", "PASS"),
      check("claude-desktop-gui", "NOT_TESTED"),
    ],
    { availableCliClients },
  )

function fullLane(clients) {
  const ok = (name, metrics) => suite(name, [check(`${name}-ok`, "PASS")], metrics)
  return [
    ok("protocol"),
    ok("privacy", { canaryLeaks: 0, surfacesChecked: 29 }),
    ok("security", {
      crossSessionLeaks: 0,
      failOpenIncidents: 0,
      mutationsTotal: 4,
      mutationsSurvived: 0,
    }),
    ok("e2e"),
    ok("adversarial"),
    ok("package"),
    ok("offline", { unexpectedEgressAttempts: 0 }),
    clients,
    ok("benchmark", {
      structuredRecall: 1,
      overallRecall: 1,
      roundtripAccuracy: 1,
      nonPiiRetention: 0.95,
      cliColdStartMs: 50,
      soakHeapGrowthMb: 20,
    }),
  ]
}

const gate = (report, id) => report.gates.find((g) => g.id === id)

test("a full lane with real CLI agents passes the release gate", () => {
  const report = evaluateReleaseGates(fullLane(clientsWith("PASS")), { release: true })
  assert.equal(report.passed, true)
  assert.equal(report.release, true)
  assert.equal(report.summary.pass, Object.keys(RELEASE_GATE_SUITES).length)
})

test("an Ollama-only clients run does not count as real-client E2E", () => {
  const results = fullLane(clientsWith("NOT_TESTED"))
  assert.equal(gate(evaluateReleaseGates(results), "real-client-e2e").status, "NOT_TESTED")
  const release = evaluateReleaseGates(results, { release: true })
  assert.equal(release.passed, false)
  assert.equal(gate(release, "real-client-e2e").status, "FAIL")
})

test("headless CI may report real clients NOT_TESTED without failing", () => {
  const ci = evaluateReleaseGates(fullLane(clientsWith("NOT_TESTED")))
  assert.equal(ci.passed, true)
  assert.equal(ci.verdict, "CONDITIONALLY READY")
})

test("a failing real CLI agent fails the gate in every mode", () => {
  const report = evaluateReleaseGates(fullLane(clientsWith("FAIL")))
  assert.equal(report.passed, false)
  assert.equal(gate(report, "real-client-e2e").status, "FAIL")
})

test("a lane that skips suites lists their gates as NOT_TESTED, never PRODUCTION READY", () => {
  const quick = fullLane(clientsWith("PASS")).filter((s) =>
    ["protocol", "privacy", "security"].includes(s.suite),
  )
  const report = evaluateReleaseGates(quick)
  assert.equal(report.passed, true)
  assert.equal(report.verdict, "CONDITIONALLY READY")
  for (const id of ["clean-package-install", "offline-operation", "performance-and-soak"]) {
    assert.equal(gate(report, id).status, "NOT_TESTED")
  }
  assert.equal(evaluateReleaseGates(quick, { release: true }).passed, false)
})

test("a release needs every real CLI agent, not just one of them", () => {
  const onlyClaude = fullLane(clientsWith("PASS", ["claude"]))
  assert.equal(gate(evaluateReleaseGates(onlyClaude), "real-client-e2e").status, "PASS")
  const release = evaluateReleaseGates(onlyClaude, { release: true })
  assert.equal(release.passed, false)
  assert.match(gate(release, "real-client-e2e").detail, /missing codex, opencode/)
})
