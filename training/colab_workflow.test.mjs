import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const TRAINING_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TRAINING_DIR, "..")

test("reusable training and benchmark shell scripts pass sh -n and --help", () => {
  for (const rel of [
    "training/run_gpu_sweep.sh",
    "training/colab_watch.sh",
    "bench/independent/run_candidate.sh",
  ]) {
    const abs = resolve(REPO_ROOT, rel)
    const syntax = spawnSync("sh", ["-n", abs], { encoding: "utf8" })
    assert.equal(syntax.status, 0, `${rel} failed sh -n: ${syntax.stderr}`)
    const help = spawnSync("sh", [abs, "--help"], { encoding: "utf8" })
    assert.equal(help.status, 0, `${rel} failed --help: ${help.stderr}`)
    assert.match(help.stdout, /Usage:/i, `${rel} --help must include Usage`)
  }
})

test("reusable Colab Python runners compile cleanly and expose --help", () => {
  for (const rel of [
    "training/colab_runner.py",
    "training/colab_hunt_gpu.py",
    "training/gen_llm_prose_expand.py",
  ]) {
    const abs = resolve(REPO_ROOT, rel)
    const compile = spawnSync("python3", ["-m", "py_compile", abs], { encoding: "utf8" })
    assert.equal(compile.status, 0, `${rel} failed py_compile: ${compile.stderr}`)
  }
  const help = spawnSync("python3", [resolve(REPO_ROOT, "training/colab_hunt_gpu.py"), "--help"], {
    encoding: "utf8",
  })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /--gpus/, "colab_hunt_gpu.py --help must document --gpus")
})

test("colab_watch.sh snapshot stays small and excludes model binaries and node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "maskera-snap-"))
  const tarPath = join(dir, "snap.tar.gz")
  try {
    const res = spawnSync(
      "bash",
      [
        resolve(REPO_ROOT, "training/colab_watch.sh"),
        "--preset",
        "training/presets/v22f.env",
        "--dry-run-snapshot",
        tarPath,
      ],
      { encoding: "utf8" },
    )
    assert.equal(res.status, 0, res.stderr)
    const sizeBytes = statSync(tarPath).size
    assert.ok(
      sizeBytes > 10_000 && sizeBytes < 15_000_000,
      `Expected snapshot under 15 MB, got ${sizeBytes} bytes`,
    )
    const entries = execFileSync("tar", ["-tzf", tarPath], { encoding: "utf8" }).split("\n")
    assert.ok(
      entries.some((e) => e.endsWith("training/run_gpu_sweep.sh")),
      "snapshot must include training/run_gpu_sweep.sh",
    )
    assert.ok(
      entries.some((e) => e.endsWith("training/presets/v22f.env")),
      "snapshot must include selected preset",
    )
    assert.ok(
      !entries.some((e) => e.includes("node_modules/")),
      "snapshot must never include node_modules",
    )
    assert.ok(
      !entries.some((e) => e.includes("apps/demo/public/models/")),
      "snapshot must never include demo ONNX binaries",
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("run_candidate.sh refuses reserved baseline tags", () => {
  for (const badTag of ["baseline", "preds"]) {
    const res = spawnSync(
      "bash",
      [
        resolve(REPO_ROOT, "bench/independent/run_candidate.sh"),
        "--model",
        "fake-model",
        "--tag",
        badTag,
      ],
      { encoding: "utf8" },
    )
    assert.notEqual(res.status, 0, `run_candidate.sh must reject reserved tag '${badTag}'`)
    assert.match(res.stderr, /Refusing reserved tag/i)
  }
})
