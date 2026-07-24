import { beforeEach, describe, expect, it, vi } from "vitest"
import { createNerRecognizer, MASKERA_SV_NER_REVISION, type NerProgressEvent } from "../src/index"

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
      model: "maskera-sv-ner-v18",
      localModelPath: "/models/",
      allowRemoteModels: false,
      onProgress: (event) => events.push(event),
    }).ready

    expect(transformers.pipeline).toHaveBeenCalledTimes(1)
    const pipelineOptions = transformers.pipeline.mock.calls[0]?.[2]
    expect(pipelineOptions?.progress_callback).toBeUndefined()
    expect(events).toEqual([
      { status: "initiate", name: "maskera-sv-ner-v18", progress: 0 },
      { status: "ready", name: "maskera-sv-ner-v18", progress: 100 },
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
    await createNerRecognizer({ cacheDir: "/tmp/maskera-cache" }).ready

    expect(transformers.env.cacheDir).toBe("/tmp/maskera-cache")
    expect(transformers.pipeline.mock.calls[0]?.[2]?.cache_dir).toBe("/tmp/maskera-cache")
  })

  it("reports a model-loading error without claiming the peer is missing", async () => {
    transformers.pipeline.mockRejectedValueOnce(new Error("model response was invalid"))

    await expect(createNerRecognizer().ready).rejects.toThrow(
      'maskera: failed to load model "joelhagvall/maskera-sv-ner".\nError: model response was invalid',
    )
  })
})
