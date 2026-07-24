const DEFAULT_API_VERSION = "2024-11-01"
const DEFAULT_BATCH_SIZE = 5
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

const FEATURE_CONFIG = {
  pii: {
    kind: "PiiEntityRecognition",
    system: "azure-pii",
    parameters: {
      domain: "none",
      piiCategories: ["Person", "Organization", "Address"],
    },
  },
  ner: {
    kind: "EntityRecognition",
    system: "azure-ner",
    parameters: {
      inclusionList: ["Person", "Location", "Organization", "Address"],
    },
  },
}

const LABEL_MAP = {
  Person: "PERSON",
  Location: "LOCATION",
  Organization: "ORGANIZATION",
  Address: "ADDRESS",
}

function assertFeature(feature) {
  if (!FEATURE_CONFIG[feature]) {
    throw new Error(`unknown Azure Language feature: ${feature}`)
  }
}

function analyzeUrl(endpoint, apiVersion) {
  let url
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error("AZURE_LANGUAGE_ENDPOINT must be a valid URL")
  }
  if (url.protocol !== "https:") {
    throw new Error("AZURE_LANGUAGE_ENDPOINT must use https")
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/language/:analyze-text`
  url.search = ""
  url.hash = ""
  url.searchParams.set("api-version", apiVersion)
  return url
}

export function buildRequest(feature, documents) {
  assertFeature(feature)
  const config = FEATURE_CONFIG[feature]
  return {
    kind: config.kind,
    parameters: {
      modelVersion: "latest",
      loggingOptOut: true,
      stringIndexType: "Utf16CodeUnit",
      ...config.parameters,
    },
    analysisInput: {
      documents: documents.map((document) => ({
        id: document.id,
        language: "sv",
        text: document.text,
      })),
    },
  }
}

export function mapEntities(text, entities) {
  const spans = []
  for (const entity of entities ?? []) {
    const label = LABEL_MAP[entity.category]
    if (!label) continue
    if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length)) {
      throw new Error(`Azure returned invalid offsets for ${entity.category}`)
    }
    const end = entity.offset + entity.length
    if (entity.offset < 0 || end > text.length || text.slice(entity.offset, end) !== entity.text) {
      throw new Error(
        `Azure ${entity.category} offset does not match the source text (${entity.offset}:${end})`,
      )
    }
    spans.push({ start: entity.offset, end, label })
  }
  return dedupeSpans(spans)
}

export function dedupeSpans(spans) {
  const seen = new Set()
  return spans
    .filter((span) => {
      const key = `${span.start}:${span.end}:${span.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label))
}

export function mergeFeatureSpans(primary, secondary) {
  const seenBoundaries = new Set()
  return [...primary, ...secondary]
    .filter((span) => {
      const key = `${span.start}:${span.end}`
      if (seenBoundaries.has(key)) return false
      seenBoundaries.add(key)
      return true
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label))
}

function retryDelayMs(response, attempt) {
  const retryAfterMs = Number(response.headers.get("retry-after-ms"))
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) return Math.min(retryAfterMs, 10_000)

  const retryAfterSeconds = Number(response.headers.get("retry-after"))
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 10_000)
  }
  return 250 * 2 ** attempt
}

async function discardBody(response) {
  try {
    await response.body?.cancel()
  } catch {
    // The error response is deliberately discarded: it may contain submitted text.
  }
}

async function requestBatch({ endpoint, key, feature, documents, apiVersion, fetchImpl, wait }) {
  const config = FEATURE_CONFIG[feature]
  const url = analyzeUrl(endpoint, apiVersion)
  const body = JSON.stringify(buildRequest(feature, documents))

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const startedAt = performance.now()
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
      },
      body,
    })
    const durationMs = performance.now() - startedAt

    if (response.ok) {
      const payload = await response.json()
      if (!payload?.results || !Array.isArray(payload.results.documents)) {
        throw new Error(`Azure ${config.kind} returned an unexpected response shape`)
      }
      const documentErrors = payload.results.errors ?? []
      if (documentErrors.length > 0) {
        const codes = documentErrors
          .map((item) => `${item.id}:${item.error?.code ?? "unknown"}`)
          .join(", ")
        throw new Error(`Azure ${config.kind} returned document errors (${codes})`)
      }
      return {
        documents: payload.results.documents,
        modelVersion: payload.results.modelVersion ?? "unknown",
        durationMs,
      }
    }

    const errorCode = response.headers.get("x-ms-error-code") ?? "unknown"
    if (RETRYABLE_STATUS.has(response.status) && attempt < 3) {
      const delayMs = retryDelayMs(response, attempt)
      await discardBody(response)
      await wait(delayMs)
      continue
    }
    await discardBody(response)
    throw new Error(
      `Azure ${config.kind} request failed (${response.status} ${response.statusText}; ${errorCode})`,
    )
  }
  throw new Error(`Azure ${config.kind} request exhausted retries`)
}

export async function analyzeFeature({
  endpoint,
  key,
  feature,
  documents,
  apiVersion = DEFAULT_API_VERSION,
  batchSize = DEFAULT_BATCH_SIZE,
  fetchImpl = fetch,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onBatch = () => {},
}) {
  assertFeature(feature)
  if (!endpoint) throw new Error("AZURE_LANGUAGE_ENDPOINT is required")
  if (!key) throw new Error("AZURE_LANGUAGE_KEY is required")
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > DEFAULT_BATCH_SIZE) {
    throw new Error(`batchSize must be between 1 and ${DEFAULT_BATCH_SIZE}`)
  }

  const input = documents.map((document, index) => ({ id: String(index), text: document.text }))
  const byId = new Map()
  const modelVersions = new Set()
  let durationMs = 0
  let requestCount = 0
  let warningCount = 0

  for (let start = 0; start < input.length; start += batchSize) {
    const batch = input.slice(start, start + batchSize)
    const result = await requestBatch({
      endpoint,
      key,
      feature,
      documents: batch,
      apiVersion,
      fetchImpl,
      wait,
    })
    requestCount += 1
    durationMs += result.durationMs
    modelVersions.add(result.modelVersion)
    for (const document of result.documents) {
      if (!batch.some((item) => item.id === document.id) || byId.has(document.id)) {
        throw new Error(`Azure returned an unexpected document id: ${document.id}`)
      }
      warningCount += document.warnings?.length ?? 0
      byId.set(document.id, document)
    }
    onBatch({ completed: Math.min(start + batch.length, input.length), total: input.length })
  }

  if (byId.size !== input.length) {
    throw new Error(`Azure returned ${byId.size} documents for ${input.length} inputs`)
  }
  if (modelVersions.size !== 1) {
    throw new Error(`Azure changed model version during the run: ${[...modelVersions].join(", ")}`)
  }

  const docs = documents.map((document, index) => ({
    text: document.text,
    spans: mapEntities(document.text, byId.get(String(index)).entities),
  }))

  return {
    system: FEATURE_CONFIG[feature].system,
    docs,
    metadata: {
      provider: "Microsoft Azure AI Language",
      feature: FEATURE_CONFIG[feature].kind,
      apiVersion,
      modelVersion: [...modelVersions][0],
      requestedModelVersion: "latest",
      language: "sv",
      loggingOptOut: true,
      stringIndexType: "Utf16CodeUnit",
      batchSize,
      requestCount,
      textRecords: documents.reduce(
        (sum, document) => sum + Math.ceil(document.text.length / 1000),
        0,
      ),
      durationMs: Math.round(durationMs),
      warningCount,
    },
  }
}

export const AZURE_API_VERSION = DEFAULT_API_VERSION
