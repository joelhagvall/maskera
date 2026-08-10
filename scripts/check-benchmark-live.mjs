#!/usr/bin/env node
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  contractPath,
  fetchWithRetry,
  firstDifference,
  readJson,
  repoRoot,
  sha256File,
} from "./benchmark-contract.mjs"

const args = new Set(process.argv.slice(2))
const predeploy = args.has("--predeploy-if-production")
if (predeploy && process.env.VERCEL_ENV !== "production") {
  console.log("benchmark live predeploy: skipped outside a production deployment")
  process.exit(0)
}

const explicitMode =
  predeploy || args.has("--upstreams") || args.has("--deployed") || args.has("--all")
const checkUpstreams = !explicitMode || args.has("--upstreams") || args.has("--all") || predeploy
const checkDeployed = !explicitMode || args.has("--deployed") || args.has("--all")
const contract = await readJson(contractPath)
const errors = []

function drift(label, url, expected, actual) {
  errors.push({ label, url, expected, actual })
}

async function fetchText(url) {
  return (await fetchWithRetry(url)).text()
}

async function expectRemoteJson(label, url, expected) {
  try {
    const actual = JSON.parse(await fetchText(url))
    const difference = firstDifference(expected, actual)
    if (difference)
      drift(`${label} at ${difference.path}`, url, difference.expected, difference.actual)
  } catch (error) {
    drift(label, url, "matching JSON", error instanceof Error ? error.message : String(error))
  }
}

async function expectRemoteText(label, url, expected) {
  try {
    const actual = await fetchText(url)
    if (actual !== expected) {
      drift(
        label,
        url,
        `exact source text (sha256 ${hashText(expected)})`,
        `sha256 ${hashText(actual)}`,
      )
    }
  } catch (error) {
    drift(label, url, "matching text", error instanceof Error ? error.message : String(error))
  }
}

async function expectRemoteHash(label, url, expected) {
  try {
    const bytes = Buffer.from(await (await fetchWithRetry(url)).arrayBuffer())
    const actual = createHash("sha256").update(bytes).digest("hex")
    if (actual !== expected) drift(label, url, expected, actual)
  } catch (error) {
    drift(label, url, expected, error instanceof Error ? error.message : String(error))
  }
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex")
}

async function checkNpmPackage(name, version, readmePath) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`
  try {
    const metadata = JSON.parse(await fetchText(url))
    const publishedVersion = metadata.versions?.[version]?.version
    if (publishedVersion !== version) drift(`${name} npm version`, url, version, publishedVersion)
    if (metadata["dist-tags"]?.latest !== version) {
      drift(`${name} npm latest tag`, url, version, metadata["dist-tags"]?.latest)
    }
    const expectedReadme = await readFile(resolve(repoRoot, readmePath), "utf8")
    if (metadata.readme !== expectedReadme) {
      drift(
        `${name} npm README`,
        url,
        `exact ${readmePath} (sha256 ${hashText(expectedReadme)})`,
        `sha256 ${hashText(metadata.readme ?? "")}`,
      )
    }
  } catch (error) {
    drift(
      `${name} npm metadata`,
      url,
      version,
      error instanceof Error ? error.message : String(error),
    )
  }
}

if (checkUpstreams) {
  if (!args.has("--skip-npm")) {
    await Promise.all([
      checkNpmPackage("maskera", contract.packages.maskera, "packages/ner/README.md"),
      checkNpmPackage("@maskera/core", contract.packages.core, "packages/core/README.md"),
    ])
  }

  if (!args.has("--skip-hf")) {
    const hubBase = `https://huggingface.co/${contract.artifact.hubRepo}`
    await expectRemoteText(
      "Hugging Face model card",
      `${hubBase}/resolve/${contract.artifact.revision}/README.md`,
      await readFile(resolve(repoRoot, "training/maskera-sv-ner-card/README.md"), "utf8"),
    )
    try {
      const hubMetadata = JSON.parse(
        await fetchText(`https://huggingface.co/api/models/${contract.artifact.hubRepo}`),
      )
      if (hubMetadata.sha !== contract.artifact.revision) {
        drift(
          "Hugging Face head revision",
          `${hubBase}/tree/main`,
          contract.artifact.revision,
          hubMetadata.sha,
        )
      }
    } catch (error) {
      drift(
        "Hugging Face metadata",
        `${hubBase}/tree/main`,
        contract.artifact.revision,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  if (!args.has("--skip-github")) {
    const revision = process.env.MASKERA_GITHUB_REVISION ?? "main"
    await expectRemoteJson(
      "GitHub benchmark contract",
      `https://raw.githubusercontent.com/joelhagvall/maskera/${revision}/docs/benchmark-release.json`,
      contract,
    )
  }
}

if (checkDeployed) {
  const site = (process.env.MASKERA_SITE_URL ?? "https://maskera.dev").replace(/\/$/, "")
  const cloudSite = (process.env.MASKERA_CLOUD_SITE_URL ?? "https://app.maskera.dev").replace(
    /\/$/,
    "",
  )
  if (!args.has("--skip-site")) {
    await expectRemoteJson(
      "maskera.dev benchmark contract",
      `${site}/benchmark-release.json`,
      contract,
    )
    await expectRemoteHash(
      "maskera.dev whitepaper",
      `${site}/whitepaper.pdf`,
      contract.whitepaper.pdfSha256,
    )
  }
  if (!args.has("--skip-cloud")) {
    await expectRemoteJson(
      "app.maskera.dev benchmark contract",
      `${cloudSite}/maskera-benchmark-release.json`,
      contract,
    )
  }
}

if (errors.length > 0) {
  console.error(`LIVE BENCHMARK DRIFT (${errors.length} problem${errors.length === 1 ? "" : "s"})`)
  for (const error of errors) {
    console.error(
      `\n- ${error.label}\n  url: ${error.url}\n  expected: ${JSON.stringify(error.expected)}\n  actual:   ${JSON.stringify(error.actual)}`,
    )
  }
  console.error(
    "\nRelease/deploy verification failed. Publish the coupled npm/HF/GitHub/site surfaces before retrying.",
  )
  process.exit(1)
}

const localContractHash = await sha256File(contractPath)
console.log(
  `benchmark live: ${contract.release} verified (${checkUpstreams ? "upstreams" : ""}${checkUpstreams && checkDeployed ? " + " : ""}${checkDeployed ? "deployed sites" : ""}, contract ${localContractHash.slice(0, 12)})`,
)
