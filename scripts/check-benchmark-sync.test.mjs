import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import YAML from "yaml"
import { evaluationEnvironmentSha256, firstDifference } from "./benchmark-contract.mjs"
import { findHardcodedModelVersions } from "./hardcoded-model-guard.mjs"

const root = resolve(import.meta.dirname, "..")

function runNode(args, env = process.env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, 60_000)
    timer.unref()
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", (error) => {
      clearTimeout(timer)
      rejectRun(error)
    })
    child.on("close", (status, signal) => {
      clearTimeout(timer)
      resolveRun({ status, signal, stdout, stderr, timedOut })
    })
  })
}

test("the checked-in benchmark contract and carriers are synchronized", async () => {
  const result = await runNode(["scripts/check-benchmark-sync.mjs"])
  assert.equal(
    result.status,
    0,
    `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
  )
  assert.match(result.stdout, /benchmark sync: v21 contract verified/)
})

test("a changed canonical metric produces an explicit drift failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-benchmark-drift-"))
  try {
    const source = JSON.parse(await readFile(join(root, "docs/benchmark-release.json"), "utf8"))
    source.metrics.syntheticGold.typeF1Pct = "92.89"
    const changedContract = join(directory, "benchmark-release.json")
    await writeFile(changedContract, `${JSON.stringify(source, null, 2)}\n`)
    const result = await runNode(["scripts/check-benchmark-sync.mjs"], {
      ...process.env,
      MASKERA_BENCHMARK_CONTRACT: changedContract,
    })
    assert.equal(
      result.status,
      1,
      `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
    )
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
    const result = await runNode(["scripts/check-benchmark-sync.mjs"], {
      ...process.env,
      MASKERA_BENCHMARK_CONTRACT: changedContract,
    })
    assert.equal(
      result.status,
      1,
      `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
    )
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
    const result = await runNode(["scripts/check-benchmark-sync.mjs"], {
      ...process.env,
      MASKERA_BENCHMARK_CONTRACT: changedContract,
    })
    assert.equal(
      result.status,
      1,
      `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
    )
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
    const result = await runNode(["scripts/check-benchmark-sync.mjs"], {
      ...process.env,
      MASKERA_BENCHMARK_CONTRACT: changedContract,
    })
    assert.equal(
      result.status,
      1,
      `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
    )
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

test("production predeploy checks upstreams without requiring the old deployed sites", async () => {
  const result = await runNode(
    [
      "scripts/check-benchmark-live.mjs",
      "--predeploy-if-production",
      "--skip-npm",
      "--skip-hf",
      "--skip-github",
    ],
    {
      ...process.env,
      VERCEL_ENV: "production",
      MASKERA_SITE_URL: "http://127.0.0.1:1",
      MASKERA_CLOUD_SITE_URL: "http://127.0.0.1:1",
    },
  )
  assert.equal(
    result.status,
    0,
    `status=${result.status} signal=${result.signal} timedOut=${result.timedOut}\n${result.stdout}\n${result.stderr}`,
  )
  assert.match(result.stdout, /verified \(upstreams, contract/)
})

test("firstDifference identifies the exact nested field", () => {
  assert.deepEqual(firstDifference({ metrics: { f1: "93.08" } }, { metrics: { f1: "92.89" } }), {
    path: "$.metrics.f1",
    expected: "93.08",
    actual: "92.89",
  })
})

test("findHardcodedModelVersions flags executable literals and ignores comments and tests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maskera-hardcoded-model-"))
  try {
    await mkdir(join(directory, "packages/example/src"), { recursive: true })
    await mkdir(join(directory, "packages/example/test"), { recursive: true })
    await writeFile(
      join(directory, "packages/example/src/good.mjs"),
      '// comment mentioning maskera-sv-ner-v20\n/* block maskera-sv-ner-v19 */\nexport const ok = "dynamic"\n',
    )
    await writeFile(
      join(directory, "packages/example/src/bad.mjs"),
      'export const stale = "maskera-sv-ner-v20"\n',
    )
    await writeFile(
      join(directory, "packages/example/test/fixture.test.ts"),
      'export const fixture = "maskera-sv-ner-v19"\n',
    )
    const hits = await findHardcodedModelVersions(directory, ["packages"])
    assert.deepEqual(hits, [
      { file: "packages/example/src/bad.mjs", line: 1, literal: "maskera-sv-ner-v20" },
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
