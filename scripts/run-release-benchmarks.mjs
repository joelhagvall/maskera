#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { contractPath, readJson, repoRoot } from "./benchmark-contract.mjs"

if (process.argv.includes("--if-production") && process.env.VERCEL_ENV !== "production") {
  console.log("published benchmark reproduction: skipped outside a production deployment")
  process.exit(0)
}

const contract = await readJson(contractPath)
const configuredDirectory = process.env.MASKERA_RELEASE_RESULT_DIR
const resultDirectory = configuredDirectory
  ? resolve(repoRoot, configuredDirectory)
  : mkdtempSync(join(tmpdir(), "maskera-release-benchmarks-"))
const modelPath = resolve(repoRoot, "apps/demo/public/models")
const commonEnv = {
  ...process.env,
  MASKERA_AGGREGATE_ONLY: "1",
  MASKERA_DTYPE: contract.artifact.dtype,
  MASKERA_MODEL: contract.artifact.model,
  MASKERA_MODEL_PATH: modelPath,
}

function run(label, cwd, script, resultFile, extraEnv = {}) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(process.execPath, [script], {
    cwd: resolve(repoRoot, cwd),
    env: {
      ...commonEnv,
      ...extraEnv,
      MASKERA_RESULT_FILE: resolve(resultDirectory, resultFile),
    },
    stdio: "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} exited with status ${result.status}`)
}

try {
  run("curated NER", "packages/ner", "eval/run-eval.mjs", "curated.json", {
    CORPUS_FILE: "./corpus.mjs",
  })
  run("synthetic ADR", "packages/ner", "eval/run-eval.mjs", "synthetic-adr.json", {
    CORPUS_FILE: "./corpus-adr.mjs",
  })
  run("LinkedIn-style NER", "packages/ner", "eval/run-eval.mjs", "linkedin-style.json", {
    CORPUS_FILE: "./corpus-linkedin.mjs",
  })
  run(
    "synthetic gold",
    "apps/demo",
    "scripts/evaluate-candidate-gates.mjs",
    "synthetic-gold.json",
    {
      MASKERA_GOLD_FILE: resolve(repoRoot, "training/eval/gold.txt"),
    },
  )
  run("rare surnames", ".", "packages/ner/eval/benchmark-rare-surnames.mjs", "rare-surnames.json", {
    BENCHMARK_FILE: resolve(repoRoot, "training/eval/rare-surnames.txt"),
  })
  run(
    "general domain regression",
    ".",
    "packages/ner/eval/domain-regression/run.mjs",
    "domain-general.json",
    { MASKERA_PROFILE: "general" },
  )
  run(
    "clinical domain regression",
    ".",
    "packages/ner/eval/domain-regression/run.mjs",
    "domain-clinical.json",
    { MASKERA_PROFILE: "clinical" },
  )

  const verification = spawnSync(
    process.execPath,
    ["scripts/verify-published-eval.mjs", resultDirectory],
    { cwd: repoRoot, env: process.env, stdio: "inherit" },
  )
  if (verification.error) throw verification.error
  if (verification.status !== 0) {
    throw new Error(`published benchmark verification exited with status ${verification.status}`)
  }
  console.log(`\nMachine-readable results: ${resultDirectory}`)
} finally {
  if (!configuredDirectory) rmSync(resultDirectory, { recursive: true, force: true })
}
