import assert from "node:assert/strict"
import test from "node:test"
import {
  analyzeFeature,
  buildRequest,
  dedupeSpans,
  mapEntities,
  mergeFeatureSpans,
} from "./azure-language.mjs"

test("buildRequest pins Swedish, UTF-16 offsets, logging opt-out, and the comparable labels", () => {
  const documents = [{ id: "0", text: "Anna bor i Malmö." }]
  const pii = buildRequest("pii", documents)
  const ner = buildRequest("ner", documents)

  assert.equal(pii.kind, "PiiEntityRecognition")
  assert.equal(ner.kind, "EntityRecognition")
  assert.equal(pii.analysisInput.documents[0].language, "sv")
  assert.equal(pii.parameters.loggingOptOut, true)
  assert.equal(ner.parameters.loggingOptOut, true)
  assert.equal(pii.parameters.stringIndexType, "Utf16CodeUnit")
  assert.equal(ner.parameters.stringIndexType, "Utf16CodeUnit")
  assert.deepEqual(pii.parameters.piiCategories, ["Person", "Organization", "Address"])
  assert.deepEqual(ner.parameters.inclusionList, ["Person", "Location", "Organization", "Address"])
})

test("mapEntities uses JavaScript-compatible UTF-16 offsets and drops unrelated categories", () => {
  const text = "👋 Anna från Malmö, ring 070-174 06 05."
  const spans = mapEntities(text, [
    { text: "Anna", category: "Person", offset: 3, length: 4 },
    { text: "Malmö", category: "Location", offset: 13, length: 5 },
    { text: "070-174 06 05", category: "PhoneNumber", offset: 24, length: 13 },
  ])

  assert.deepEqual(spans, [
    { start: 3, end: 7, label: "PERSON" },
    { start: 13, end: 18, label: "LOCATION" },
  ])
})

test("dedupeSpans removes exact PII/NER duplicates without hiding different labels", () => {
  assert.deepEqual(
    dedupeSpans([
      { start: 0, end: 4, label: "PERSON" },
      { start: 0, end: 4, label: "PERSON" },
      { start: 0, end: 4, label: "ORGANIZATION" },
    ]),
    [
      { start: 0, end: 4, label: "ORGANIZATION" },
      { start: 0, end: 4, label: "PERSON" },
    ],
  )
})

test("mergeFeatureSpans keeps the primary label for equal boundaries", () => {
  assert.deepEqual(
    mergeFeatureSpans(
      [{ start: 0, end: 12, label: "ADDRESS" }],
      [
        { start: 0, end: 12, label: "LOCATION" },
        { start: 20, end: 25, label: "LOCATION" },
      ],
    ),
    [
      { start: 0, end: 12, label: "ADDRESS" },
      { start: 20, end: 25, label: "LOCATION" },
    ],
  )
})

test("analyzeFeature authenticates, reorders response documents, and never stores the key", async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(
      JSON.stringify({
        kind: "EntityRecognitionResults",
        results: {
          documents: [
            {
              id: "1",
              entities: [{ text: "Malmö", category: "Location", offset: 0, length: 5 }],
              warnings: [],
            },
            {
              id: "0",
              entities: [{ text: "Anna", category: "Person", offset: 0, length: 4 }],
              warnings: [],
            },
          ],
          errors: [],
          modelVersion: "test-model",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  }

  const result = await analyzeFeature({
    endpoint: "https://example.cognitiveservices.azure.com/",
    key: "super-secret",
    feature: "ner",
    documents: [{ text: "Anna" }, { text: "Malmö" }],
    fetchImpl,
  })

  assert.match(requests[0].url, /language\/:analyze-text\?api-version=2024-11-01$/)
  assert.equal(requests[0].init.headers["Ocp-Apim-Subscription-Key"], "super-secret")
  assert.deepEqual(result.docs[0].spans, [{ start: 0, end: 4, label: "PERSON" }])
  assert.deepEqual(result.docs[1].spans, [{ start: 0, end: 5, label: "LOCATION" }])
  assert.equal(JSON.stringify(result).includes("super-secret"), false)
  assert.equal(result.metadata.modelVersion, "test-model")
})

test("HTTP errors report status but not the API key or response body", async () => {
  const fetchImpl = async () =>
    new Response('{"error":{"message":"echoed submitted text"}}', {
      status: 401,
      statusText: "Unauthorized",
      headers: { "x-ms-error-code": "InvalidSubscriptionKey" },
    })

  await assert.rejects(
    analyzeFeature({
      endpoint: "https://example.cognitiveservices.azure.com/",
      key: "super-secret",
      feature: "pii",
      documents: [{ text: "Anna" }],
      fetchImpl,
    }),
    (error) => {
      assert.match(error.message, /401 Unauthorized; InvalidSubscriptionKey/)
      assert.equal(error.message.includes("super-secret"), false)
      assert.equal(error.message.includes("submitted text"), false)
      return true
    },
  )
})
