import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { assertSourceManifest } from "./privacy_attestation.mjs"
import { validateAttestation } from "./verify_attestation.mjs"

const hash = (character) => character.repeat(64)
const manifest = {
  schemaVersion: 1,
  dataPolicy: "synthetic-task-data-only",
  addressPolicy: "explicit-synthetic-marker",
  generatedBy: "training/generate_data.mjs",
  generatorSha256: hash("a"),
  train: { rows: 2, sha256: hash("b") },
  validation: { rows: 1, sha256: hash("c") },
}
const splits = {
  train: { rows: 2, sha256: hash("b") },
  validation: { rows: 1, sha256: hash("c") },
}

test("accepts exact generator and data hashes", () => {
  assert.doesNotThrow(() => assertSourceManifest(manifest, hash("a"), splits))
})

test("rejects a different generator hash", () => {
  assert.throws(() => assertSourceManifest(manifest, hash("d"), splits), /generator/)
})

test("rejects appended or edited data", () => {
  assert.throws(
    () =>
      assertSourceManifest(manifest, hash("a"), {
        ...splits,
        train: { rows: 3, sha256: hash("e") },
      }),
    /train data no longer matches/,
  )
})

test("verifier binds the attestation to the exact provenance code and manifest", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "maskera-attestation-"))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  mkdirSync(join(directory, "data"))

  const contents = {
    "generate_data.mjs": "// synthetic generator\n",
    "privacy_guard.mjs": "// fail-closed guard\n",
    "audit_data.mjs": "// data audit\n",
    "privacy_attestation.mjs": "// attestation builder\n",
    "verify_attestation.mjs": "// attestation verifier\n",
  }
  const digest = (value) => createHash("sha256").update(value).digest("hex")
  for (const [file, content] of Object.entries(contents)) {
    writeFileSync(join(directory, file), content)
  }

  const trainText = '{"tokens":["syntetisk"],"tags":["O"]}\n{"tokens":["text"],"tags":["O"]}\n'
  const validationText = '{"tokens":["validering"],"tags":["O"]}\n'
  writeFileSync(join(directory, "data/train.jsonl"), trainText)
  writeFileSync(join(directory, "data/val.jsonl"), validationText)
  const train = { rows: 2, sha256: digest(trainText) }
  const validation = { rows: 1, sha256: digest(validationText) }
  const sourceManifest = {
    schemaVersion: 1,
    dataPolicy: "synthetic-task-data-only",
    addressPolicy: "explicit-synthetic-marker",
    generatedBy: "training/generate_data.mjs",
    generatorSha256: digest(contents["generate_data.mjs"]),
    seed: 1337,
    configuration: { baseTrainRows: 2, baseValidationRows: 1 },
    train,
    validation,
  }
  const manifestText = `${JSON.stringify(sourceManifest, null, 2)}\n`
  const manifestPath = join(directory, "data/source-manifest.json")
  writeFileSync(manifestPath, manifestText)

  const value = {
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
      sha256: sourceManifest.generatorSha256,
      seed: sourceManifest.seed,
      configuration: sourceManifest.configuration,
    },
    sourceManifestSha256: digest(manifestText),
    auditCode: {
      privacyGuardSha256: digest(contents["privacy_guard.mjs"]),
      dataAuditSha256: digest(contents["audit_data.mjs"]),
      attestationBuilderSha256: digest(contents["privacy_attestation.mjs"]),
      attestationVerifierSha256: digest(contents["verify_attestation.mjs"]),
    },
    train,
    validation,
  }

  assert.equal(validateAttestation(value, directory), true)
  assert.equal(
    validateAttestation(
      { ...value, auditCode: { ...value.auditCode, privacyGuardSha256: hash("f") } },
      directory,
    ),
    false,
  )
  assert.equal(
    validateAttestation(
      { ...value, generator: { ...value.generator, sha256: hash("e") } },
      directory,
    ),
    false,
  )
  assert.equal(validateAttestation({ ...value, sourceManifestSha256: hash("d") }, directory), false)
  writeFileSync(join(directory, "data/train.jsonl"), `${trainText} `)
  assert.equal(validateAttestation(value, directory), false)
})
