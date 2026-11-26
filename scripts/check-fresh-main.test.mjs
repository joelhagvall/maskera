import assert from "node:assert/strict"
import { test } from "node:test"
import { decide, FETCH_MAX_AGE_MS, fetchIsStale } from "./check-fresh-main.mjs"

test("fails on main behind origin/main", () => {
  const result = decide({ ci: false, branch: "main", behind: 26, fetchFailed: false })
  assert.equal(result.ok, false)
  assert.match(result.error, /26 commit\(s\) behind/)
  assert.match(result.error, /git pull --rebase --autostash origin main/)
})

test("passes on fresh or ahead main", () => {
  assert.equal(decide({ ci: false, branch: "main", behind: 0, fetchFailed: false }).ok, true)
})

test("skips CI and detached or other-branch checkouts", () => {
  assert.equal(decide({ ci: true, branch: "main", behind: 5, fetchFailed: false }).ok, true)
  assert.equal(
    decide({ ci: false, branch: null, behind: null, fetchFailed: false }).reason,
    "not-main",
  )
  assert.equal(decide({ ci: false, branch: "feature", behind: null, fetchFailed: false }).ok, true)
})

test("only warns when origin/main cannot be checked", () => {
  const result = decide({ ci: false, branch: "main", behind: null, fetchFailed: true })
  assert.equal(result.ok, true)
  assert.match(result.warning, /could not fetch/)
})

test("fetches at most every ten minutes", () => {
  const now = 1_000_000_000
  assert.equal(fetchIsStale(null, now), true)
  assert.equal(fetchIsStale(now - FETCH_MAX_AGE_MS + 1, now), false)
  assert.equal(fetchIsStale(now - FETCH_MAX_AGE_MS - 1, now), true)
})
