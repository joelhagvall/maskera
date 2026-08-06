/** Create a machine-readable attestation for the exact audited train/dev files. */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

import { assertSyntheticAddressSpans, assertTrainingRowPrivacy } from "./privacy_guard.mjs"

function inspect(path) {
  const bytes = readFileSync(path)
  let rows = 0
  for (const [index, line] of bytes.toString("utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const row = JSON.parse(line)
    assertTrainingRowPrivacy(row.tokens, `${path}:${index + 1}`)
    assertSyntheticAddressSpans(row.tokens, row.tags, `${path}:${index + 1}`)
    rows++
  }
  return { rows, sha256: createHash("sha256").update(bytes).digest("hex") }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

export function assertSourceManifest(manifest, generatorSha256, splits) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.dataPolicy !== "synthetic-task-data-only" ||
    manifest.addressPolicy !== "explicit-synthetic-marker" ||
    manifest.generatedBy !== "training/generate_data.mjs" ||
    manifest.generatorSha256 !== generatorSha256
  ) {
    throw new Error(
      "Training source manifest does not match the current synthetic generator; regenerate the data",
    )
  }
  for (const [name, actual] of Object.entries(splits)) {
    const expected = manifest[name]
    if (!expected || expected.rows !== actual.rows || expected.sha256 !== actual.sha256) {
      throw new Error(
        `${name} data no longer matches the generator source manifest; refusing to attest it`,
      )
    }
  }
}

function main() {
  const train = inspect("data/train.jsonl")
  const validation = inspect("data/val.jsonl")
  const manifest = JSON.parse(readFileSync("data/source-manifest.json", "utf8"))
  assertSourceManifest(manifest, sha256("generate_data.mjs"), { train, validation })

  const attestation = {
    schemaVersion: 2,
    dataPolicy: "synthetic-task-data-only",
    addressPolicy: "explicit-synthetic-marker",
    taskSpecificTrainingSources: ["training/generate_data.mjs"],
    excludedSources: [
      "Flashback",
      "Familjeliv",
      "SIC2",
      "SUCX 3.0 NER",
      "Swedish NER Corpus",
      "MASSIVE",
      "MultiCoNER v2",
    ],
    baseModel: {
      id: "KBLab/bert-base-swedish-cased",
      revision: "ce7c3424687f042f1320e0528293d492c82918c4",
      license: "cc0-1.0",
    },
    generator: {
      sha256: manifest.generatorSha256,
      seed: manifest.seed,
      configuration: manifest.configuration,
    },
    sourceManifestSha256: sha256("data/source-manifest.json"),
    auditCode: {
      privacyGuardSha256: sha256("privacy_guard.mjs"),
      dataAuditSha256: sha256("audit_data.mjs"),
      attestationBuilderSha256: sha256("privacy_attestation.mjs"),
      attestationVerifierSha256: sha256("verify_attestation.mjs"),
    },
    train,
    validation,
  }

  const output = process.argv[2] ?? "data/privacy-attestation.json"
  writeFileSync(output, `${JSON.stringify(attestation, null, 2)}\n`)
  console.log(
    `privacy attestation: synthetic-only, ${attestation.train.rows} train + ${attestation.validation.rows} validation rows`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
