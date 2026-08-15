import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import YAML from "yaml"
import { evaluationEnvironmentSha256, firstDifference } from "./benchmark-contract.mjs"

const root = resolve(import.meta.dirname, "..")

test("the checked-in benchmark contract and carriers are synchronized", () => {
  const result = spawnSync(process.execPath, ["scripts/check-benchmark-sync.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /benchmark sync: v19 contract verified/)
})

test("a changed canonical metric produces an explicit drift failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-drift-"))
  try {
    const source = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    source.metrics.syntheticGold.typeF1Pct = "92.89"
    const changedContract = join(directory, "benchmark-release.json")
    await writeFile(changedContract, `${JSON.stringify(source, null, 2)}\n`)
    const result = spawnSync(process.execPath, ["scripts/check-benchmark-sync.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MASKERA_BENCHMARK_CONTRACT: changedContract },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BENCHMARK DRIFT/)
    assert.match(result.stderr, /synthetic-gold type F1/)
    assert.match(result.stderr, /92\.89/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("an invalid metric type fails the published JSON Schema", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-schema-"))
  try {
    const source = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    source.metrics.structuredRegression.misses = "11"
    const changedContract = join(directory, "benchmark-release.json")
    await writeFile(changedContract, `${JSON.stringify(source, null, 2)}\n`)
    const result = spawnSync(process.execPath, ["scripts/check-benchmark-sync.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MASKERA_BENCHMARK_CONTRACT: changedContract },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BENCHMARK DRIFT/)
    assert.match(result.stderr, /contract JSON Schema/)
    assert.match(result.stderr, /structuredRegression\/misses must be integer/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a changed evaluation input checksum fails before release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-suite-"))
  try {
    const source = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    source.evaluation.suiteSha256 = "0".repeat(64)
    const changedContract = join(directory, "benchmark-release.json")
    await writeFile(changedContract, `${JSON.stringify(source, null, 2)}\n`)
    const result = spawnSync(process.execPath, ["scripts/check-benchmark-sync.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MASKERA_BENCHMARK_CONTRACT: changedContract },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BENCHMARK DRIFT/)
    assert.match(result.stderr, /evaluation suite checksum/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a changed evaluation environment checksum fails before release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-environment-"))
  try {
    const source = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    source.evaluation.environment.sha256 = "0".repeat(64)
    const changedContract = join(directory, "benchmark-release.json")
    await writeFile(changedContract, `${JSON.stringify(source, null, 2)}\n`)
    const result = spawnSync(process.execPath, ["scripts/check-benchmark-sync.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MASKERA_BENCHMARK_CONTRACT: changedContract },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /BENCHMARK DRIFT/)
    assert.match(result.stderr, /evaluation environment checksum/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("an unrelated development dependency does not change the eval environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-unrelated-lock-"))
  try {
    const contract = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    const source = YAML.parse(await readFile(join(root, "pnpm-lock.yaml"), "utf8"))
    source.importers["."].devDependencies["@biomejs/biome"].version = "99.0.0"
    const changedLockfile = join(directory, "pnpm-lock.yaml")
    await writeFile(changedLockfile, YAML.stringify(source))

    const expected = await evaluationEnvironmentSha256(contract.evaluation.environment)
    const actual = await evaluationEnvironmentSha256(contract.evaluation.environment, {
      lockfilePath: changedLockfile,
    })
    assert.equal(actual, expected)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a type-only peer version does not change the eval environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-type-peer-"))
  try {
    const contract = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    const original = await readFile(join(root, "pnpm-lock.yaml"), "utf8")
    // Read the resolved version from the lockfile instead of pinning it here,
    // so a routine @types/node bump cannot turn this test into a no-op.
    const pinned = original.match(/@types\/node@(\d+\.\d+\.\d+)/)?.[1]
    assert.ok(pinned, "lockfile resolves @types/node")
    const changed = original.replaceAll(`@types/node@${pinned}`, "@types/node@99.0.0")
    assert.notEqual(changed, original)
    const changedLockfile = join(directory, "pnpm-lock.yaml")
    await writeFile(changedLockfile, changed)

    const expected = await evaluationEnvironmentSha256(contract.evaluation.environment)
    const actual = await evaluationEnvironmentSha256(contract.evaluation.environment, {
      lockfilePath: changedLockfile,
    })
    assert.equal(actual, expected)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a selected runtime resolution changes the eval environment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-runtime-lock-"))
  try {
    const contract = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    const source = YAML.parse(await readFile(join(root, "pnpm-lock.yaml"), "utf8"))
    source.packages["@huggingface/transformers@4.2.0"].resolution.integrity += "changed"
    const changedLockfile = join(directory, "pnpm-lock.yaml")
    await writeFile(changedLockfile, YAML.stringify(source))

    const expected = await evaluationEnvironmentSha256(contract.evaluation.environment)
    const actual = await evaluationEnvironmentSha256(contract.evaluation.environment, {
      lockfilePath: changedLockfile,
    })
    assert.notEqual(actual, expected)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("production predeploy checks upstreams without requiring the old deployed sites", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/check-benchmark-live.mjs",
      "--predeploy-if-production",
      "--skip-npm",
      "--skip-hf",
      "--skip-github",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL_ENV: "production",
        MASKERA_SITE_URL: "http://127.0.0.1:1",
        MASKERA_CLOUD_SITE_URL: "http://127.0.0.1:1",
      },
    },
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /verified \(upstreams, contract/)
})

test("firstDifference identifies the exact nested field", () => {
  assert.deepEqual(firstDifference({ metrics: { f1: "93.08" } }, { metrics: { f1: "92.89" } }), {
    path: "$.metrics.f1",
    expected: "93.08",
    actual: "92.89",
  })
})
