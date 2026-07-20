/**
 * Minimal ambient declaration of the slice of `@huggingface/transformers`
 * we use, so this package type-checks and builds even when the (optional,
 * heavy) peer dependency isn't installed. At runtime we dynamic-import it.
 */
declare module "@huggingface/transformers" {
  export interface TokenClassificationSingle {
    entity_group?: string
    entity?: string
    score: number
    index?: number
    word: string
    start?: number | null
    end?: number | null
  }

  export interface TokenClassificationOptions {
    aggregation_strategy?: "none" | "first" | "average" | "max" | "simple"
  }

  export type TokenClassificationPipeline = (
    text: string,
    options?: TokenClassificationOptions,
  ) => Promise<TokenClassificationSingle[]>

  export interface PipelineOptions {
    dtype?: string
    device?: "wasm" | "webgpu" | "cpu" | "auto"
    cache_dir?: string
    progress_callback?: (progress: unknown) => void
  }

  export function pipeline(
    task: "token-classification",
    model?: string,
    options?: PipelineOptions,
  ): Promise<TokenClassificationPipeline>

  export const env: {
    version?: string
    localModelPath?: string
    allowRemoteModels?: boolean
    allowLocalModels?: boolean
    cacheDir?: string
    [key: string]: unknown
  }
}
