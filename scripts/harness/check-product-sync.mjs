#!/usr/bin/env node
/**
 * Verifies that `docs/product-contract.json` matches package versions, active
 * site pricing/plan copy, and any locally checked-out sibling repos
 * (`maskera-cloud`, `maskera-extension`, `hagvall-labs`).
 */
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))

/** Pure check on package versions + i18n services copy. */
export function checkContractConsistency({ contract, pkgVersions, svCopy, enCopy }) {
  const errors = []
  for (const [key, expected] of Object.entries(contract.packages)) {
    if (pkgVersions[key] !== expected) {
      errors.push(
        `package "${key}" version is ${pkgVersions[key]}, expected ${expected} from docs/product-contract.json`,
      )
    }
  }
  const { free, pro, team } = contract.plans
  for (const [lang, copy] of [
    ["sv", svCopy],
    ["en", enCopy],
  ]) {
    const servicesText = JSON.stringify(copy.services ?? {})
    for (const token of [
      String(pro.priceSekMonthly),
      String(team.priceSekMonthly),
      String(pro.trialDays),
      String(free.monthlyAiLimit),
      String(team.minSeats),
    ]) {
      if (!servicesText.includes(token)) {
        errors.push(`apps/demo/src/i18n/${lang}.json services copy is missing "${token}"`)
      }
    }
    if (/\b14[\s-](?:dagar|dagars|day|days)\b/i.test(servicesText)) {
      errors.push(
        `apps/demo/src/i18n/${lang}.json services copy still mentions a 14-day trial (contract is ${pro.trialDays} days)`,
      )
    }
  }
  return errors
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function main() {
  const contractPath = join(ROOT, "docs", "product-contract.json")
  const contractRaw = readFileSync(contractPath, "utf8")
  const contract = JSON.parse(contractRaw)
  const pkgVersions = {
    core: readJson(join(ROOT, "packages", "core", "package.json")).version,
    maskera: readJson(join(ROOT, "packages", "ner", "package.json")).version,
    mcp: readJson(join(ROOT, "packages", "mcp", "package.json")).version,
  }
  const svCopy = readJson(join(ROOT, "apps", "demo", "src", "i18n", "sv.json"))
  const enCopy = readJson(join(ROOT, "apps", "demo", "src", "i18n", "en.json"))

  const errors = checkContractConsistency({ contract, pkgVersions, svCopy, enCopy })

  if (!process.env.CI && !process.env.VERCEL) {
    const parent = resolve(ROOT, "..")
    for (const sibling of ["maskera-cloud", "maskera-extension"]) {
      const vendored = join(parent, sibling, "docs", "maskera-product-contract.json")
      if (existsSync(vendored) && readFileSync(vendored, "utf8") !== contractRaw) {
        errors.push(
          `sibling ../${sibling}/docs/maskera-product-contract.json drifted from docs/product-contract.json (run \`bun run sync:product\` in ${sibling})`,
        )
      }
    }
    const hagvallSeo = join(parent, "hagvall-labs", "src", "seo.ts")
    if (existsSync(hagvallSeo)) {
      const seoText = readFileSync(hagvallSeo, "utf8")
      const match = seoText.match(/export const maskeraVersion = ['"]([^'"]+)['"]/)
      if (match && match[1] !== contract.packages.maskera) {
        errors.push(
          `sibling ../hagvall-labs/src/seo.ts has maskeraVersion=${match[1]}, expected ${contract.packages.maskera}`,
        )
      }
    }
  }

  if (errors.length > 0) {
    for (const err of errors) console.error(`check-product-sync: ${err}`)
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
