/** Validate the provenance metadata that must travel with every model artifact. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const sha256 = /^[a-f0-9]{64}$/
const requiredExclusions = [
  "Flashback",
  "Familjeliv",
  "SIC2",
  "SUCX 3.0 NER",
  "Swedish NER Corpus",
  "MASSIVE",
  "MultiCoNER v2",
]
const validFile = (file) =>
  Number.isInteger(file?.rows) && file.rows > 0 && sha256.test(file?.sha256 ?? "")

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function describeJsonl(path) {
  const bytes = readFileSync(path)
  const rows = bytes
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length
  return { rows, sha256: createHash("sha256").update(bytes).digest("hex") }
}

export function validateAttestation(value, trainingDir) {
  const manifestPath = join(trainingDir, "data/source-manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const exactManifestPolicy =
    manifest.schemaVersion === 1 &&
    manifest.dataPolicy === "synthetic-task-data-only" &&
    manifest.addressPolicy === "explicit-synthetic-marker" &&
    manifest.generatedBy === "training/generate_data.mjs"
  const exactSources =
    Array.isArray(value.taskSpecificTrainingSources) &&
    value.taskSpecificTrainingSources.length === 1 &&
    value.taskSpecificTrainingSources[0] === "training/generate_data.mjs"
  const exactExclusions =
    Array.isArray(value.excludedSources) &&
    value.excludedSources.length === requiredExclusions.length &&
    requiredExclusions.every((source, index) => value.excludedSources[index] === source)
  const exactGenerator =
    value.generator?.sha256 === digest(join(trainingDir, "generate_data.mjs")) &&
    value.generator.sha256 === manifest.generatorSha256 &&
    value.generator.seed === manifest.seed &&
    JSON.stringify(value.generator.configuration) === JSON.stringify(manifest.configuration)
  const exactAuditCode =
    value.auditCode?.privacyGuardSha256 === digest(join(trainingDir, "privacy_guard.mjs")) &&
    value.auditCode?.dataAuditSha256 === digest(join(trainingDir, "audit_data.mjs")) &&
    value.auditCode?.attestationBuilderSha256 ===
      digest(join(trainingDir, "privacy_attestation.mjs")) &&
    value.auditCode?.attestationVerifierSha256 ===
      digest(join(trainingDir, "verify_attestation.mjs"))
  const exactManifest = value.sourceManifestSha256 === digest(manifestPath)
  const exactSplits =
    JSON.stringify(value.train) === JSON.stringify(manifest.train) &&
    JSON.stringify(value.validation) === JSON.stringify(manifest.validation) &&
    JSON.stringify(value.train) ===
      JSON.stringify(describeJsonl(join(trainingDir, "data/train.jsonl"))) &&
    JSON.stringify(value.validation) ===
      JSON.stringify(describeJsonl(join(trainingDir, "data/val.jsonl")))

  return (
    value.schemaVersion === 2 &&
    value.dataPolicy === "synthetic-task-data-only" &&
    value.addressPolicy === "explicit-synthetic-marker" &&
    value.baseModel?.id === "KBLab/bert-base-swedish-cased" &&
    value.baseModel?.revision === "ce7c3424687f042f1320e0528293d492c82918c4" &&
    value.baseModel?.license === "cc0-1.0" &&
    exactSources &&
    exactExclusions &&
    exactGenerator &&
    exactAuditCode &&
    exactManifestPolicy &&
    exactManifest &&
    exactSplits &&
    validFile(value.train) &&
    validFile(value.validation)
  )
}

function main() {
  const path = process.argv[2]
  if (!path) throw new Error("Usage: node verify_attestation.mjs <privacy-attestation.json>")
  const value = JSON.parse(readFileSync(path, "utf8"))
  const trainingDir = dirname(fileURLToPath(import.meta.url))
  if (!validateAttestation(value, trainingDir)) {
    throw new Error(`${path}: incomplete, stale, or invalid synthetic-only provenance attestation`)
  }
  console.log(`verified synthetic-only provenance attestation: ${path}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
