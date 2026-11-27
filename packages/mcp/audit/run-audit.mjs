#!/usr/bin/env node
/**
 * Permanent Audit & Release-Gate Runner for `@maskera/mcp`.
 *
 * Lanes:
 *   quick        unit + protocol + privacy + security (fast local/PR gate)
 *   privacy      canary scanner & network egress auditor
 *   security     security invariants + live mutation testing (negative controls)
 *   e2e          built CLI E2E + protocol conformance
 *   clients      real installed AI clients over packed & installed tarball
 *   adversarial  Unicode, formats, streaming, injection, concurrency, fuzzing
 *   package      tarball pack, contents & supply-chain check, clean install smoke
 *   offline      active network egress blocker verification
 *   benchmark    unseen Swedish corpus production eval, latencies & 500-op soak
 *   full         all lanes + release gate evaluation
 *
 * Usage:
 *   node audit/run-audit.mjs <lane> [--json] [--ci] [--live] [--release] [--out <file.json>]
 *
 * `--release` is the npm publish gate run by `pnpm release`: it only accepts
 * the full lane, and every release gate must PASS (NOT_TESTED fails).
 * `--evidence` (`pnpm audit:evidence`) is a `--release` run of the full lane
 * that writes the committed audit-results.json and regenerates its AUDIT.md
 * block, which `pnpm release` requires to name the version being published.
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { arch, cpus, platform, totalmem } from "node:os"
import { dirname, join, resolve } from "node:path"
import { MASKERA_SV_NER_MODEL, MASKERA_SV_NER_REVISION } from "maskera"
import { evaluateReleaseGates } from "./gates.mjs"
import {
  createSuiteCollector,
  distCliPath,
  hasLocalNerModel,
  pkgRoot,
  repoRoot,
  runProcess,
} from "./lib/harness.mjs"
import { runAdversarialAudit } from "./suites/adversarial.mjs"
import { runBenchmarkAudit } from "./suites/benchmark.mjs"
import { runClientsAudit } from "./suites/clients.mjs"
import { runOfflineAudit } from "./suites/offline.mjs"
import { runPackageAudit } from "./suites/package.mjs"
import { runPrivacyAudit } from "./suites/privacy.mjs"
import { runProtocolAudit } from "./suites/protocol.mjs"
import { runSecurityAudit } from "./suites/security.mjs"
import { AUDIT_FILES, writeAuditSummary } from "./summary.mjs"

const LANES = new Set([
  "quick",
  "privacy",
  "security",
  "e2e",
  "clients",
  "adversarial",
  "package",
  "offline",
  "benchmark",
  "full",
])

function parseCli(argv) {
  let lane = "quick"
  let jsonOut = false
  let ciMode = false
  let live = false
  let release = false
  let evidence = false
  let outPath = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--") continue
    if (arg === "--json") jsonOut = true
    else if (arg === "--ci") ciMode = true
    else if (arg === "--live") live = true
    else if (arg === "--release") release = true
    else if (arg === "--evidence") evidence = true
    else if (arg === "--out") outPath = argv[++i] ?? null
    else if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length)
    else if (LANES.has(arg)) lane = arg
    else if (arg === "--help" || arg === "-h") {
      console.log(
        `Usage: node audit/run-audit.mjs <${[...LANES].join("|")}> [--json] [--ci] [--live] [--release] [--evidence] [--out <path>]`,
      )
      process.exit(0)
    } else {
      throw new Error(`Unknown audit option or lane: ${arg}`)
    }
  }
  if (evidence) {
    if (outPath) throw new Error("--evidence always writes audit-results.json; drop --out")
    release = true
    outPath = AUDIT_FILES.report
  }
  if (release && lane !== "full") {
    throw new Error(`--release gates a publish and needs the full lane, not ${lane}`)
  }
  return { lane, jsonOut, ciMode, live, release, evidence, outPath }
}

function getCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim()
  } catch {
    return "unknown"
  }
}

async function runExistingE2eSuite() {
  const suite = createSuiteCollector("e2e")
  await suite.check(
    "built-cli-e2e-agent-test",
    "Runs scripts/e2e-agent-test.mjs (7 end-to-end suites on built dist/cli.js)",
    async () => {
      const run = await runProcess(
        process.execPath,
        [resolve(pkgRoot, "scripts/e2e-agent-test.mjs")],
        {
          cwd: pkgRoot,
          timeoutMs: 120_000,
        },
      )
      if (run.code !== 0) {
        throw new Error(`e2e-agent-test failed (${run.code}):\n${run.stderr}\n${run.stdout}`)
      }
      const match = run.stdout.match(/PASS: (\d+ suites passed)/)
      return match ? match[1] : "ok"
    },
  )
  return suite.finish()
}

async function main() {
  const opts = parseCli(process.argv.slice(2))

  if (!existsSync(distCliPath)) {
    execFileSync("pnpm", ["--filter", "@maskera/mcp", "build"], { cwd: repoRoot, stdio: "inherit" })
  }

  const mcpPkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8"))
  const suiteRunners = {
    protocol: () => runProtocolAudit(),
    privacy: () => runPrivacyAudit(),
    security: () => runSecurityAudit(),
    e2e: () => runExistingE2eSuite(),
    adversarial: () => runAdversarialAudit(),
    package: () => runPackageAudit(),
    offline: () => runOfflineAudit(),
    clients: () => runClientsAudit({ live: opts.live }),
    benchmark: () => runBenchmarkAudit(),
  }

  const lanePlan = {
    quick: ["protocol", "privacy", "security"],
    privacy: ["privacy"],
    security: ["security"],
    e2e: ["protocol", "e2e"],
    clients: ["clients"],
    adversarial: ["adversarial"],
    package: ["package"],
    offline: ["offline"],
    benchmark: ["benchmark"],
    full: [
      "protocol",
      "privacy",
      "security",
      "e2e",
      "adversarial",
      "package",
      "offline",
      "clients",
      "benchmark",
    ],
  }

  const selected = lanePlan[opts.lane]
  const startedAt = performance.now()
  const results = []
  for (const name of selected) {
    if (!opts.jsonOut) {
      process.stderr.write(`[audit] running ${name}...\n`)
    }
    const res = await suiteRunners[name]()
    results.push(res)
    if (!opts.jsonOut) {
      process.stderr.write(
        `[audit] ${name}: ${res.status} (${res.passed}/${res.total} pass, ${res.failed} fail, ${res.notTested} not_tested, ${res.durationMs}ms)\n`,
      )
    }
  }

  const totals = {
    pass: results.reduce((s, r) => s + r.passed, 0),
    fail: results.reduce((s, r) => s + r.failed, 0),
    blocked: results.reduce((s, r) => s + r.blocked, 0),
    notTested: results.reduce((s, r) => s + r.notTested, 0),
  }
  const releaseGates = evaluateReleaseGates(results, { release: opts.release })

  const report = {
    schema: "maskera-mcp-audit-report/v1",
    lane: opts.lane,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startedAt),
    commitSha: getCommitSha(),
    packageName: mcpPkg.name,
    packageVersion: mcpPkg.version,
    model: {
      id: MASKERA_SV_NER_MODEL,
      revision: MASKERA_SV_NER_REVISION,
      localModelAvailable: hasLocalNerModel,
    },
    environment: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      ramBytes: totalmem(),
      ci: opts.ciMode || Boolean(process.env.CI),
    },
    totals,
    releaseGates,
    suites: results,
  }

  const baseCwd = process.env.INIT_CWD || process.cwd()
  if (opts.outPath) {
    const absOut = resolve(baseCwd, opts.outPath)
    await mkdir(dirname(absOut), { recursive: true })
    await writeFile(absOut, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  // Evidence only counts when the strict gate passed; a red run leaves AUDIT.md
  // stale, so `pnpm release` keeps refusing.
  if (opts.evidence && totals.fail === 0 && releaseGates.passed) writeAuditSummary()

  if (opts.jsonOut) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    console.log(`\n=== @maskera/mcp audit (${opts.lane}) ===`)
    console.log(
      `Commit: ${report.commitSha.slice(0, 12)} | Package: ${report.packageName}@${report.packageVersion} | Model: ${report.model.id}@${report.model.revision.slice(0, 12)}`,
    )
    console.log(
      `Checks: PASS=${totals.pass} FAIL=${totals.fail} BLOCKED=${totals.blocked} NOT_TESTED=${totals.notTested}`,
    )
    console.log(
      `Release Gates: ${releaseGates.passed ? "PASS" : "FAIL"} | Verdict: ${releaseGates.verdict}`,
    )
    for (const g of releaseGates.gates) {
      console.log(`  [${g.status.padEnd(10)}] ${g.id}: ${g.detail}`)
    }
    for (const s of results) {
      for (const c of s.checks) {
        if (c.status === "FAIL") {
          console.log(`  FAIL ${s.suite}/${c.id}: ${c.detail}`)
        }
      }
    }
    if (opts.outPath) {
      console.log(`Saved JSON report: ${resolve(baseCwd, opts.outPath)}`)
    }
  }

  if (totals.fail > 0 || !releaseGates.passed) {
    process.exit(1)
  }
}

void main().catch((err) => {
  console.error(`[audit] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`)
  process.exit(1)
})
