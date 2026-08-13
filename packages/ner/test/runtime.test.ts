import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  createNerRecognizer,
  MASKERA_SV_NER_MODEL,
  MASKERA_SV_NER_REVISION,
  type NerProgressEvent,
} from "../src/index"

interface MockPipelineOptions {
  cache_dir?: string
  device?: string
  revision?: string
  progress_callback?: (progress: unknown) => void
}

const transformers = vi.hoisted(() => {
  const env: Record<string, unknown> = {}
  const pipeline = vi.fn(async (_task: string, _model: string, _options?: MockPipelineOptions) => {
    const pipe = vi.fn(async () => []) as ReturnType<typeof vi.fn> & {
      tokenizer?: { encode: (text: string) => number[] }
    }
    pipe.tokenizer = { encode: () => [] }
    return pipe
  })
  return { env, pipeline }
})

vi.mock("@huggingface/transformers", () => transformers)

beforeEach(() => {
  for (const key of Object.keys(transformers.env)) delete transformers.env[key]
  transformers.pipeline.mockClear()
})

describe("Transformers runtime integration", () => {
  it("defaults Node inference to CPU and honours an explicit device", async () => {
    await createNerRecognizer().ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.device).toBe("cpu")

    transformers.pipeline.mockClear()
    await createNerRecognizer({ device: "wasm" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.device).toBe("wasm")
  })

  // Without a revision Transformers.js resolves `main`, so the Hub decides
  // which weights run inside an already-released version of maskera.
  it("pins maskera's own model to an immutable Hub commit", async () => {
    await createNerRecognizer().ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBe(MASKERA_SV_NER_REVISION)
    expect(MASKERA_SV_NER_REVISION).toMatch(/^[0-9a-f]{40}$/)
  })

  it("leaves a third-party model on the Transformers.js default revision", async () => {
    // maskera's sha names a commit in maskera's repo; sending it to someone
    // else's would request a revision that repo has never had.
    await createNerRecognizer({ model: "Xenova/bert-base-NER" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBeUndefined()
  })

  it("honours an explicit revision, including opting back into main", async () => {
    await createNerRecognizer({ revision: "main" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBe("main")

    transformers.pipeline.mockClear()
    await createNerRecognizer({ model: "Xenova/bert-base-NER", revision: "v2" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBe("v2")
  })

  it("uses coarse progress for self-hosted models by default", async () => {
    const events: NerProgressEvent[] = []

    await createNerRecognizer({
      model: "maskera-sv-ner-v19",
      localModelPath: "/models/",
      allowRemoteModels: false,
      onProgress: (event) => events.push(event),
    }).ready

    expect(transformers.pipeline).toHaveBeenCalledTimes(1)
    const pipelineOptions = transformers.pipeline.mock.calls[0]?.[2]
    expect(pipelineOptions?.progress_callback).toBeUndefined()
    expect(events).toEqual([
      { status: "initiate", name: "maskera-sv-ner-v19", progress: 0 },
      { status: "ready", name: "maskera-sv-ner-v19", progress: 100 },
    ])
  })

  it("allows patched runtimes to opt in to native local progress", async () => {
    const onProgress = vi.fn()

    await createNerRecognizer({
      localModelPath: "/models/",
      nativeLocalProgress: true,
      onProgress,
    }).ready

    const pipelineOptions = transformers.pipeline.mock.calls[0]?.[2]
    expect(pipelineOptions?.progress_callback).toBeTypeOf("function")
    expect(onProgress).not.toHaveBeenCalled()
  })

  it("redirects Yarn PnP's read-only virtual cache", async () => {
    transformers.env.cacheDir = "/node_modules/@huggingface/transformers/.cache/"

    await createNerRecognizer().ready

    expect(transformers.env.cacheDir).toBe(`${process.cwd()}/.cache/transformers`)
  })

  it("honours an explicit cache directory in env and pipeline options", async () => {
    // Project-local, not /tmp: a world-writable cache dir lets another local
    // user swap the model files (verifyModelIntegrity only covers the pinned
    // default model). This path is only asserted, never touched.
    const cacheDir = `${process.cwd()}/.cache/maskera-test-cache-dir`
    await createNerRecognizer({ cacheDir }).ready

    expect(transformers.env.cacheDir).toBe(cacheDir)
    expect(transformers.pipeline.mock.calls[0]?.[2]?.cache_dir).toBe(cacheDir)
  })

  it("reports a model-loading error without claiming the peer is missing", async () => {
    transformers.pipeline.mockRejectedValueOnce(new Error("model response was invalid"))

    await expect(createNerRecognizer().ready).rejects.toThrow(
      'maskera: failed to load model "joelhagvall/maskera-sv-ner".\nError: model response was invalid',
    )
  })

  it("rejects an invalid minScore instead of silently dropping every detection", () => {
    // `avg >= NaN` is always false: a NaN threshold would silently drop ALL
    // model detections, which is fail-open for PII. Throw instead.
    expect(() => createNerRecognizer({ minScore: Number.NaN })).toThrow(
      /minScore must be a finite number between 0 and 1/,
    )
    expect(() => createNerRecognizer({ minScore: -0.1 })).toThrow(/minScore/)
    expect(() => createNerRecognizer({ minScore: 1.5 })).toThrow(/minScore/)
    expect(() => createNerRecognizer({ minScore: Number.POSITIVE_INFINITY })).toThrow(/minScore/)
    expect(() => createNerRecognizer({ minScore: 0 })).not.toThrow()
    expect(() => createNerRecognizer({ minScore: 1 })).not.toThrow()
  })

  it("starts no load at construction, so an unused recognizer cannot crash the process", async () => {
    // An eagerly started load that rejects while the consumer never awaits
    // `ready` is an unhandled rejection, and Node >= 15 crashes the whole
    // process on those. With the lazy getter nothing exists to reject: no
    // load starts until `ready` is accessed or detect() is called.
    const recognizer = createNerRecognizer()
    expect(transformers.pipeline).not.toHaveBeenCalled()
    // Give any stray microtask a chance to reject; vitest fails the run on
    // unhandled rejections, so reaching the end clean IS the assertion.
    await new Promise((resolve) => setTimeout(resolve, 10))
    transformers.pipeline.mockRejectedValueOnce(new Error("boom"))
    await expect(recognizer.ready).rejects.toThrow("maskera: failed to load model")
  })

  it("surfaces a load failure through detect() as a controlled rejection", async () => {
    transformers.pipeline.mockRejectedValueOnce(new Error("boom"))
    await expect(createNerRecognizer().detect("hej")).rejects.toThrow(
      'maskera: failed to load model "joelhagvall/maskera-sv-ner".',
    )
  })

  it("rejects a path-traversal revision, accepts shas and branch names", async () => {
    // The revision is interpolated verbatim into Transformers.js's cache key
    // and path.join normalises "..", so an unvalidated revision is a
    // read/write primitive outside the cache directory.
    for (const bad of ["../../../../etc/x", "..", "/abs/path", "a\\b", "refs/../x", ""]) {
      expect(() => createNerRecognizer({ revision: bad })).toThrow(/invalid revision/)
    }
    await createNerRecognizer({ revision: "b1aa7e799fa4839f8668dda691e893706e971523" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBe(
      "b1aa7e799fa4839f8668dda691e893706e971523",
    )
    transformers.pipeline.mockClear()
    await createNerRecognizer({ revision: "refs/convert/parquet" }).ready
    expect(transformers.pipeline.mock.calls[0]?.[2]?.revision).toBe("refs/convert/parquet")
  })

  it("refuses to load when a cached pinned-model file fails its sha256 check", async () => {
    // The revision pin controls WHAT is downloaded; Transformers.js's
    // FileCache then trusts any file that merely EXISTS. Plant a tampered
    // file where the pinned revision's weights would live: load must fail
    // closed BEFORE the bytes reach the (mocked) pipeline.
    const dir = await mkdtemp(join(tmpdir(), "maskera-integrity-"))
    try {
      const modelDir = join(dir, MASKERA_SV_NER_MODEL, MASKERA_SV_NER_REVISION, "onnx")
      await mkdir(modelDir, { recursive: true })
      await writeFile(join(modelDir, "model_q4.onnx"), "not the real weights")

      await expect(createNerRecognizer({ cacheDir: dir }).ready).rejects.toThrow(
        /model integrity check failed/,
      )
      expect(transformers.pipeline).not.toHaveBeenCalled()

      // The check is opt-out-able, and never applies to third-party models:
      // they have no digest map, so the same tampered bytes pass through.
      await createNerRecognizer({ cacheDir: dir, verifyModelIntegrity: false }).ready
      expect(transformers.pipeline).toHaveBeenCalledTimes(1)
      await createNerRecognizer({ cacheDir: dir, model: "Xenova/bert-base-NER" }).ready
      expect(transformers.pipeline).toHaveBeenCalledTimes(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
