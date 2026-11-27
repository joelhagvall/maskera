import assert from "node:assert/strict"
import test from "node:test"
import { checkContractConsistency } from "./check-product-sync.mjs"

const CONTRACT = {
  plans: {
    free: { priceSek: 0, monthlyAiLimit: 20 },
    pro: { priceSekMonthly: 149, vatIncluded: true, trialDays: 7 },
    team: { priceSekMonthly: 249, vatIncluded: false, minSeats: 5 },
  },
  packages: { core: "0.8.4", maskera: "0.11.1", mcp: "0.4.0" },
}

test("checkContractConsistency passes when versions and copy match", () => {
  const copy = { services: { summary: "20 AI, 149 kr, 7 dagar, 249 kr från 5 användare" } }
  assert.deepEqual(
    checkContractConsistency({
      contract: CONTRACT,
      pkgVersions: { ...CONTRACT.packages },
      svCopy: copy,
      enCopy: copy,
    }),
    [],
  )
})

test("checkContractConsistency flags drifted version and stale 14-day trial", () => {
  const errors = checkContractConsistency({
    contract: CONTRACT,
    pkgVersions: { core: "0.8.4", maskera: "0.10.0", mcp: "0.4.0" },
    svCopy: { services: { summary: "20 AI, 149 kr, 14 dagar, 249 kr, 5 användare" } },
    enCopy: { services: { summary: "20 AI, 149, 7 days, 249, 5 users" } },
  })
  assert.equal(errors.length, 3)
})
