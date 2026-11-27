import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  assertWithinBudget,
  DEFAULT_LIVE_MAX_USD,
  extractClaudeCostUsd,
  parseAuditCli,
  parseMaxUsd,
} from "./lib/live-budget.mjs"

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

test("parseMaxUsd accepts positive finite USD caps and falls back to default", () => {
  assert.equal(parseMaxUsd(undefined), DEFAULT_LIVE_MAX_USD)
  assert.equal(parseMaxUsd("0.50"), 0.5)
  assert.equal(parseMaxUsd("1"), 1)
  assert.equal(parseMaxUsd(".15"), 0.15)
  assert.equal(parseMaxUsd(0.75), 0.75)
})

test("parseMaxUsd rejects zero, negative, non-numeric, and malformed values", () => {
  for (const bad of ["", "0", "-0.1", "NaN", "Infinity", "0.5usd", "abc", 0, -2, Number.NaN]) {
    assert.throws(() => parseMaxUsd(bad), /Invalid --max-usd/)
  }
})

test("extractClaudeCostUsd reads total_cost_usd from single-line or trailing JSON", () => {
  assert.equal(extractClaudeCostUsd('{"type":"result","total_cost_usd":0.0123}'), 0.0123)
  assert.equal(
    extractClaudeCostUsd('warning line\n{"type":"result","total_cost_usd":0.0045}\n'),
    0.0045,
  )
  assert.equal(extractClaudeCostUsd('{"type":"result"}'), null)
  assert.equal(extractClaudeCostUsd("not json"), null)
})

test("assertWithinBudget enforces the configured USD cap", () => {
  assert.doesNotThrow(() =>
    assertWithinBudget({ spentUsd: 0.25, maxUsd: 0.25, label: "claude-live" }),
  )
  assert.throws(
    () => assertWithinBudget({ spentUsd: 0.26, maxUsd: 0.25, label: "claude-live" }),
    /exceeded --max-usd cap/,
  )
})

test("parseAuditCli validates --max-usd and requires --live with it", () => {
  const def = parseAuditCli(["clients"])
  assert.equal(def.live, false)
  assert.equal(def.maxUsd, DEFAULT_LIVE_MAX_USD)

  const live = parseAuditCli(["clients", "--live", "--max-usd", "0.40"])
  assert.equal(live.live, true)
  assert.equal(live.maxUsd, 0.4)

  const eq = parseAuditCli(["clients", "--live", "--max-usd=0.10"])
  assert.equal(eq.maxUsd, 0.1)

  assert.throws(() => parseAuditCli(["clients", "--max-usd", "0.50"]), /--max-usd requires --live/)
  assert.throws(() => parseAuditCli(["clients", "--live", "--max-usd", "0"]), /Invalid --max-usd/)
})

test("e2e-harnesses rejects --max-usd without --live and invalid --max-usd even before build", () => {
  const script = resolve(pkgRoot, "scripts/e2e-harnesses.mjs")
  const withoutLive = spawnSync(process.execPath, [script, "--max-usd", "0.50"], {
    encoding: "utf8",
  })
  assert.notEqual(withoutLive.status, 0)
  assert.match(withoutLive.stderr, /--max-usd requires --live/)

  const badBudget = spawnSync(process.execPath, [script, "--live", "--max-usd", "0"], {
    encoding: "utf8",
  })
  assert.notEqual(badBudget.status, 0)
  assert.match(badBudget.stderr, /Invalid --max-usd/)
})
