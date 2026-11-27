#!/usr/bin/env node
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import Ajv2020 from "ajv/dist/2020.js"
import { renderSection, replaceSection } from "../bench/independent/render-markdown.mjs"
import {
  contractPath as defaultContractPath,
  evaluationEnvironmentSha256,
  firstDifference,
  formatBytes,
  readJson,
  repoRoot,
  sha256File,
  sha256FileSet,
} from "./benchmark-contract.mjs"

const requestedContract = process.env.MASKERA_BENCHMARK_CONTRACT
const activeContractPath = requestedContract
  ? resolve(process.cwd(), requestedContract)
  : defaultContractPath
const requireModel =
  process.argv.includes("--require-model") || process.env.MASKERA_REQUIRE_MODEL === "1"
const contract = await readJson(activeContractPath)
const errors = []

function drift(label, file, expected, actual) {
  errors.push({ label, file, expected, actual })
}

function requireValue(label, expected, actual) {
  if (!Object.is(expected, actual)) drift(label, "docs/benchmark-release.json", expected, actual)
}

try {
  const schemaFile = "docs/benchmark-release.schema.json"
  const schema = await readJson(resolve(repoRoot, schemaFile))
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false })
  const validate = ajv.compile(schema)
  if (!validate(contract)) {
    drift(
      "contract JSON Schema",
      activeContractPath,
      `valid ${schemaFile}`,
      ajv.errorsText(validate.errors, { separator: "; " }),
    )
  }
} catch (error) {
  drift(
    "contract JSON Schema",
    "docs/benchmark-release.schema.json",
    "a valid Draft 2020-12 schema",
    error instanceof Error ? error.message : String(error),
  )
}

async function expectFragments(file, expectations) {
  const absolute = resolve(repoRoot, file)
  if (!existsSync(absolute)) {
    drift("required carrier", file, "file to exist", "missing")
    return
  }
  const source = await readFile(absolute, "utf8")
  for (const [label, fragment] of expectations) {
    if (!source.includes(fragment)) drift(label, file, fragment, "fragment missing")
  }
}

async function expectJsonEqual(label, file, expected) {
  const actual = await readJson(resolve(repoRoot, file))
  const difference = firstDifference(expected, actual)
  if (difference) {
    drift(`${label} at ${difference.path}`, file, difference.expected, difference.actual)
  }
}

async function expectHash(label, file, expected) {
  const absolute = resolve(repoRoot, file)
  if (!existsSync(absolute)) {
    drift(label, file, expected, "missing")
    return
  }
  const actual = await sha256File(absolute)
  if (actual !== expected) drift(label, file, expected, actual)
}

requireValue("schemaVersion", 5, contract.schemaVersion)
requireValue("status", "published", contract.status)
if (!/^v\d+$/.test(contract.release ?? "")) {
  drift("release", "docs/benchmark-release.json", "v<number>", contract.release)
}
if (!/^[a-f0-9]{40}$/.test(contract.artifact?.revision ?? "")) {
  drift(
    "Hub revision",
    "docs/benchmark-release.json",
    "40 lowercase hex characters",
    contract.artifact?.revision,
  )
}
for (const [label, value] of [
  ["artifact sha256", contract.artifact?.sha256],
  ["model-card sha256", contract.artifact?.modelCardSha256],
  ["whitepaper source sha256", contract.whitepaper?.sourceSha256],
  ["whitepaper PDF sha256", contract.whitepaper?.pdfSha256],
  ["evaluation suite sha256", contract.evaluation?.suiteSha256],
  ["evaluation environment sha256", contract.evaluation?.environment?.sha256],
  ["comparison result sha256", contract.comparison?.resultSha256],
  ["comparison suite sha256", contract.comparison?.suiteSha256],
  ["comparison environment sha256", contract.comparison?.environment?.sha256],
  ["comparison Maskera artifact sha256", contract.comparison?.models?.maskera?.sha256],
  ["comparison KBLab artifact sha256", contract.comparison?.models?.kblab?.sha256],
  ["redaction comparison result sha256", contract.redactionComparison?.resultSha256],
  ["redaction comparison suite sha256", contract.redactionComparison?.suiteSha256],
  ["redaction comparison environment sha256", contract.redactionComparison?.environment?.sha256],
  ["redaction comparison corpus sha256", contract.redactionComparison?.corpus?.sha256],
]) {
  if (!/^[a-f0-9]{64}$/.test(value ?? ""))
    drift(label, "docs/benchmark-release.json", "64 lowercase hex characters", value)
}

const {
  artifact,
  comparison,
  evaluation,
  historical,
  metrics,
  packages,
  redactionComparison,
  whitepaper,
} = contract
const { curated, syntheticAdr, linkedinStyle, syntheticGold, rareSurnames, structuredRegression } =
  metrics
const bytes = formatBytes(artifact.bytes)
const historicalModelRows = historical.modelComparison.rows

requireValue(
  "historical model corpus documents",
  historical.independentGold.documents,
  historical.modelComparison.corpus.documents,
)
requireValue(
  "historical model corpus entities",
  historical.independentGold.entities,
  historical.modelComparison.corpus.entities,
)
requireValue(
  "historical model row count",
  historicalModelRows.length,
  new Set(historicalModelRows.map((row) => row.system)).size,
)

function historicalModelMarkdownRow(row) {
  if (row.ours) {
    return `| **maskera student** | **${row.size}** | ${row.redactionRecall} | **${row.typedPrecision}** | ${row.typedRecall} | **${row.typedF1}** |`
  }
  return `| ${row.system} | ${row.size} | ${row.redactionRecall} | ${row.typedPrecision} | ${row.typedRecall} | ${row.typedF1} |`
}

await expectFragments("docs/BENCHMARKS.md", [
  ["published date", `**Published:** ${contract.publishedAt}`],
  ["artifact sha", `sha256 \`${artifact.sha256}\``],
  ["artifact revision", `Hub revision \`${artifact.revision}\`, ${bytes} bytes`],
  ["release reproduction command", `\`${evaluation.command}\``],
  ["evaluation suite checksum", `\`${evaluation.suiteSha256}\``],
  ["evaluation environment checksum", `\`${evaluation.environment.sha256}\``],
  [
    "curated release row",
    `| curated, ${curated.documents} documents / ${curated.entities} entities | ${curated.precisionPct}% | ${curated.recallPct}% | ${curated.spanF1Pct}% | ${curated.labeledF1Pct}% | ${curated.leaks}/${curated.entities}`,
  ],
  [
    "synthetic ADR release row",
    `| synthetic ADR, ${syntheticAdr.documents} documents / ${syntheticAdr.entities} entities | ${syntheticAdr.precisionPct}% | ${syntheticAdr.recallPct}% | **${syntheticAdr.spanF1Pct}%** | ${syntheticAdr.labeledF1Pct}% | **${syntheticAdr.leaks}/${syntheticAdr.entities}`,
  ],
  [
    "LinkedIn release row",
    `| LinkedIn-style, ${linkedinStyle.documents} documents / ${linkedinStyle.entities} entities | ${linkedinStyle.precisionPct}% | ${linkedinStyle.recallPct}% | ${linkedinStyle.spanF1Pct}% | ${linkedinStyle.labeledF1Pct}% | **${linkedinStyle.leaks}/${linkedinStyle.entities}`,
  ],
  [
    "synthetic-gold type F1",
    `| synthetic gold, type F1 | ${syntheticGold.typeF1Pct}% | ${syntheticGold.typeF1FloorPct}% |`,
  ],
  [
    "synthetic-gold type recall",
    `| synthetic gold, type recall | ${syntheticGold.typeRecallPct}% | ${syntheticGold.typeRecallFloorPct}% |`,
  ],
  [
    "synthetic-gold masked recall",
    `| synthetic gold, masked recall | ${syntheticGold.maskedRecallPct}% | ${syntheticGold.maskedRecallFloorPct}% |`,
  ],
  [
    "rare-surname gate",
    `${rareSurnames.maskedRecallPct}% (${rareSurnames.masked}/${rareSurnames.entities}; ${rareSurnames.leaks} leaks)`,
  ],
  [
    "historical boundary",
    `Historical ${historical.release} snapshot: not a ${contract.release} result.`,
  ],
  [
    "current KBLab original row",
    `| original | **Maskera ${contract.release} q4** | **${comparison.normal.maskera.maskedRecallPct}% (${comparison.normal.maskera.masked}/${comparison.corpus.entities})** | ${comparison.normal.maskera.typedF1Pct}% |`,
  ],
  [
    "current KBLab lowercase row",
    `| lowercase | KBLab lowermix fp32 | ${comparison.lowercase.kblab.maskedRecallPct}% (${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}) | ${comparison.lowercase.kblab.typedF1Pct}% |`,
  ],
  ["comparison reproduction command", `Reproduce with \`${comparison.command}\``],
  ["comparison suite checksum", `Comparison suite\nchecksum: \`${comparison.suiteSha256}\``],
  [
    "redaction comparison Maskera row",
    `| **Maskera ${contract.release} q4** | **${redactionComparison.systems.maskera.fullHitRatePct}% (${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations})** | ${redactionComparison.systems.maskera.partialLeaks} | ${redactionComparison.systems.maskera.misses} |`,
  ],
  [
    "redaction comparison LogosGuard row",
    `| LogosGuard ${redactionComparison.systems.logosguard.version} | ${redactionComparison.systems.logosguard.fullHitRatePct}% (${redactionComparison.systems.logosguard.fullHits}/${redactionComparison.corpus.annotations}) | ${redactionComparison.systems.logosguard.partialLeaks} | ${redactionComparison.systems.logosguard.misses} |`,
  ],
  ["redaction comparison score command", `\`${redactionComparison.commands.score}\``],
  [
    "redaction comparison result checksum",
    `Product-comparison result checksum: \`${redactionComparison.resultSha256}\``,
  ],
  [
    "redaction comparison suite checksum",
    `Product-comparison suite checksum: \`${redactionComparison.suiteSha256}\``,
  ],
  ...historicalModelRows.map((row) => [
    `historical model row: ${row.system}`,
    historicalModelMarkdownRow(row),
  ]),
])

const actualSuiteHash = await sha256FileSet(evaluation.files)
if (actualSuiteHash !== evaluation.suiteSha256) {
  drift(
    "evaluation suite checksum",
    "docs/benchmark-release.json",
    evaluation.suiteSha256,
    actualSuiteHash,
  )
}

const actualComparisonSuiteHash = await sha256FileSet(comparison.files)
if (actualComparisonSuiteHash !== comparison.suiteSha256) {
  drift(
    "comparison suite checksum",
    "docs/benchmark-release.json",
    comparison.suiteSha256,
    actualComparisonSuiteHash,
  )
}
await expectHash(
  "comparison environment checksum",
  comparison.environment.requirements,
  comparison.environment.sha256,
)
await expectHash("comparison result checksum", comparison.resultFile, comparison.resultSha256)

const comparisonResult = await readJson(resolve(repoRoot, comparison.resultFile))
for (const [role, model] of Object.entries(comparison.models)) {
  const resultArtifact = comparisonResult.artifacts?.[model.id]
  for (const [field, expected] of [
    ["revision", model.revision],
    ["path", model.path],
    ["sha256", model.sha256],
    ["bytes", model.bytes],
  ]) {
    if (!Object.is(expected, resultArtifact?.[field])) {
      drift(
        `comparison ${role} artifact ${field}`,
        comparison.resultFile,
        expected,
        resultArtifact?.[field],
      )
    }
  }
}
const comparisonRuns = Object.fromEntries(comparisonResult.runs.map((run) => [run.name, run]))
const comparisonSystems = (run) =>
  Object.fromEntries(
    run.results.map((result) => [
      result.model === comparison.models.maskera.id ? "maskera" : "kblab",
      result,
    ]),
  )
const comparisonPct = (value) => (value * 100).toFixed(1)
const normalSystems = comparisonSystems(comparisonRuns["synthetic hand-authored set"])
const lowercaseSystems = comparisonSystems(comparisonRuns["synthetic hand-authored set LOWERCASED"])

for (const [label, expected, actual] of [
  ["comparison measured date", comparison.measuredAt, comparisonResult.measuredAt],
  ["comparison matching", comparison.matching, comparisonResult.matching],
  ["comparison corpus sha256", comparison.corpus.sha256, comparisonResult.corpus.sha256],
  ["comparison artifact revision", artifact.revision, comparison.models.maskera.revision],
  ["comparison artifact sha256", artifact.sha256, comparison.models.maskera.sha256],
  [
    "comparison normal documents",
    comparison.corpus.documents,
    comparisonRuns["synthetic hand-authored set"].documents,
  ],
  [
    "comparison normal entities",
    comparison.corpus.entities,
    comparisonRuns["synthetic hand-authored set"].entities,
  ],
  [
    "comparison normal Maskera masked",
    comparison.normal.maskera.masked,
    normalSystems.maskera.redactionHits,
  ],
  [
    "comparison normal Maskera recall",
    comparison.normal.maskera.maskedRecallPct,
    comparisonPct(normalSystems.maskera.redactionRecall),
  ],
  [
    "comparison normal Maskera typed F1",
    comparison.normal.maskera.typedF1Pct,
    comparisonPct(normalSystems.maskera.typedF1),
  ],
  [
    "comparison normal KBLab masked",
    comparison.normal.kblab.masked,
    normalSystems.kblab.redactionHits,
  ],
  [
    "comparison normal KBLab recall",
    comparison.normal.kblab.maskedRecallPct,
    comparisonPct(normalSystems.kblab.redactionRecall),
  ],
  [
    "comparison normal KBLab typed F1",
    comparison.normal.kblab.typedF1Pct,
    comparisonPct(normalSystems.kblab.typedF1),
  ],
  [
    "comparison lowercase Maskera masked",
    comparison.lowercase.maskera.masked,
    lowercaseSystems.maskera.redactionHits,
  ],
  [
    "comparison lowercase Maskera recall",
    comparison.lowercase.maskera.maskedRecallPct,
    comparisonPct(lowercaseSystems.maskera.redactionRecall),
  ],
  [
    "comparison lowercase Maskera typed F1",
    comparison.lowercase.maskera.typedF1Pct,
    comparisonPct(lowercaseSystems.maskera.typedF1),
  ],
  [
    "comparison lowercase KBLab masked",
    comparison.lowercase.kblab.masked,
    lowercaseSystems.kblab.redactionHits,
  ],
  [
    "comparison lowercase KBLab recall",
    comparison.lowercase.kblab.maskedRecallPct,
    comparisonPct(lowercaseSystems.kblab.redactionRecall),
  ],
  [
    "comparison lowercase KBLab typed F1",
    comparison.lowercase.kblab.typedF1Pct,
    comparisonPct(lowercaseSystems.kblab.typedF1),
  ],
]) {
  if (!Object.is(expected, actual)) {
    drift(label, comparison.resultFile, expected, actual)
  }
}

const actualRedactionSuiteHash = await sha256FileSet(redactionComparison.files)
if (actualRedactionSuiteHash !== redactionComparison.suiteSha256) {
  drift(
    "redaction comparison suite checksum",
    "docs/benchmark-release.json",
    redactionComparison.suiteSha256,
    actualRedactionSuiteHash,
  )
}
await expectHash(
  "redaction comparison result checksum",
  redactionComparison.resultFile,
  redactionComparison.resultSha256,
)

const redactionCorpusFiles = redactionComparison.files.filter((file) =>
  file.startsWith("packages/ner/eval/domain-regression/corpus/"),
)
const actualRedactionCorpusHash = await sha256FileSet(redactionCorpusFiles)
if (actualRedactionCorpusHash !== redactionComparison.corpus.sha256) {
  drift(
    "redaction comparison corpus checksum",
    "docs/benchmark-release.json",
    redactionComparison.corpus.sha256,
    actualRedactionCorpusHash,
  )
}

try {
  const actualRedactionEnvironmentHash = await evaluationEnvironmentSha256(
    redactionComparison.environment,
  )
  if (actualRedactionEnvironmentHash !== redactionComparison.environment.sha256) {
    drift(
      "redaction comparison environment checksum",
      redactionComparison.environment.lockfile,
      redactionComparison.environment.sha256,
      actualRedactionEnvironmentHash,
    )
  }
} catch (error) {
  drift(
    "redaction comparison environment",
    redactionComparison.environment?.lockfile ?? "docs/benchmark-release.json",
    "a resolvable selected dependency closure",
    error instanceof Error ? error.message : String(error),
  )
}

const redactionResult = await readJson(resolve(repoRoot, redactionComparison.resultFile))
for (const [label, expected, actual] of [
  [
    "redaction comparison measured date",
    redactionComparison.measuredAt,
    redactionResult.measuredAt,
  ],
  [
    "redaction comparison documents",
    redactionComparison.corpus.documents,
    redactionResult.corpus?.texts,
  ],
  [
    "redaction comparison annotations",
    redactionComparison.corpus.annotations,
    redactionResult.corpus?.annotations,
  ],
  [
    "redaction comparison corpus sha256",
    redactionComparison.corpus.sha256,
    redactionResult.corpus?.sha256,
  ],
  [
    "redaction comparison Maskera version",
    redactionComparison.systems.maskera.version,
    redactionResult.systems?.maskera?.version,
  ],
  [
    "redaction comparison Maskera artifact sha256",
    artifact.sha256,
    redactionResult.systems?.maskera?.artifact?.sha256,
  ],
  [
    "redaction comparison Maskera artifact bytes",
    artifact.bytes,
    redactionResult.systems?.maskera?.artifact?.bytes,
  ],
  [
    "redaction comparison LogosGuard version",
    redactionComparison.systems.logosguard.version,
    redactionResult.systems?.logosguard?.version,
  ],
  [
    "redaction comparison LogosGuard surface",
    redactionComparison.systems.logosguard.surface,
    redactionResult.systems?.logosguard?.surface,
  ],
  [
    "redaction comparison LogosGuard plan",
    redactionComparison.systems.logosguard.plan,
    redactionResult.systems?.logosguard?.plan,
  ],
  [
    "redaction comparison LogosGuard accuracy",
    redactionComparison.systems.logosguard.accuracy,
    redactionResult.systems?.logosguard?.accuracy,
  ],
]) {
  if (!Object.is(expected, actual)) {
    drift(label, redactionComparison.resultFile, expected, actual)
  }
}

for (const system of ["maskera", "logosguard"]) {
  const expected = redactionComparison.systems[system]
  const actual = redactionResult.systems?.[system]?.totals
  for (const [label, expectedValue, actualValue] of [
    ["full hits", expected.fullHits, actual?.hits],
    ["partial leaks", expected.partialLeaks, actual?.partials],
    ["misses", expected.misses, actual?.misses],
    ["full-hit rate", expected.fullHitRatePct, actual?.fullHitRatePct],
    ["redactions", expected.redactions, actual?.redactions],
  ]) {
    if (!Object.is(expectedValue, actualValue)) {
      drift(
        `redaction comparison ${system} ${label}`,
        redactionComparison.resultFile,
        expectedValue,
        actualValue,
      )
    }
  }
}

try {
  const actualEnvironmentHash = await evaluationEnvironmentSha256(evaluation.environment)
  if (actualEnvironmentHash !== evaluation.environment.sha256) {
    drift(
      "evaluation environment checksum",
      evaluation.environment.lockfile,
      evaluation.environment.sha256,
      actualEnvironmentHash,
    )
  }
} catch (error) {
  drift(
    "evaluation environment",
    evaluation.environment?.lockfile ?? "docs/benchmark-release.json",
    "a resolvable selected dependency closure",
    error instanceof Error ? error.message : String(error),
  )
}

await expectFragments("training/README.md", [
  [
    "training synthetic-gold row",
    `| synthetic gold | type F1 ${syntheticGold.typeF1Pct}%; type recall ${syntheticGold.typeRecallPct}%; masked recall ${syntheticGold.maskedRecallPct}% |`,
  ],
  ["training artifact revision", artifact.revision],
  [
    "training current KBLab comparison",
    `Maskera masked ${comparison.normal.maskera.masked}/${comparison.corpus.entities} with original`,
  ],
  [
    "training current KBLab lowercase result",
    `KBLab masked ${comparison.normal.kblab.masked}/${comparison.corpus.entities} and ${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}. Typed F1 was`,
  ],
  [
    "training LogosGuard comparison",
    `fully removed ${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.maskera.fullHitRatePct}%) annotated values`,
  ],
])
await expectFragments("README.md", [
  [
    "root curated claim",
    `**${curated.spanF1Pct}% span F1**, **${curated.leaks}/${curated.entities} leaks**`,
  ],
  [
    "root ADR claim",
    `**${syntheticAdr.spanF1Pct}% span F1**, **${syntheticAdr.leaks}/${syntheticAdr.entities} leaks**`,
  ],
  [
    "root LinkedIn claim",
    `**${linkedinStyle.spanF1Pct}% span F1**, **${linkedinStyle.leaks}/${linkedinStyle.entities} leaks**`,
  ],
  ["root historical boundary", `historical ${historical.release}`],
  [
    "root current KBLab Maskera result",
    `**${comparison.normal.maskera.masked}/${comparison.corpus.entities}** orig & **${comparison.lowercase.maskera.masked}/${comparison.corpus.entities}** lower`,
  ],
  [
    "root current KBLab result",
    `vs ${comparison.normal.kblab.masked}/${comparison.corpus.entities} & ${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}`,
  ],
  [
    "root hybrid pipeline",
    `**${structuredRegression.fullHits}/${structuredRegression.entities} (${structuredRegression.hitRatePct}%)** full hits`,
  ],
])
await expectFragments("packages/core/README.md", [
  [
    "core package hybrid pipeline",
    `reaches ${structuredRegression.fullHits}/${structuredRegression.entities} (${structuredRegression.hitRatePct}%) full hits`,
  ],
])
await expectFragments("packages/ner/README.md", [
  [
    "package curated claim",
    `**Curated set:** ${curated.spanF1Pct}% span F1, ${curated.leaks}/${curated.entities} leaks.`,
  ],
  [
    "package LinkedIn claim",
    `**LinkedIn-style set:** ${linkedinStyle.spanF1Pct}% span F1, ${linkedinStyle.leaks}/${linkedinStyle.entities} leaks.`,
  ],
  [
    "package historical boundary",
    `Historical ${historical.release} comparisons (${historical.curated.spanF1Pct}% curated span-F1`,
  ],
  [
    "package current KBLab Maskera result",
    `Maskera masked ${comparison.normal.maskera.masked}/${comparison.corpus.entities} with original casing and ${comparison.lowercase.maskera.masked}/${comparison.corpus.entities} lowercased`,
  ],
  [
    "package current KBLab result",
    `KBLab masked ${comparison.normal.kblab.masked}/${comparison.corpus.entities} and ${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}`,
  ],
  [
    "package hybrid pipeline",
    `${structuredRegression.fullHits}/${structuredRegression.entities} (${structuredRegression.hitRatePct}%) full hits`,
  ],
])
await expectFragments("training/maskera-sv-ner-card/README.md", [
  ["model-card current heading", `Published privacy-clean ${contract.release}`],
  [
    "model-card curated claim",
    `| Curated (${curated.documents} docs / ${curated.entities} entities) | **${curated.spanF1Pct}%** | **${curated.leaks}/${curated.entities}** |`,
  ],
  [
    "model-card LinkedIn claim",
    `| LinkedIn-style (${linkedinStyle.documents} docs / ${linkedinStyle.entities} entities) | **${linkedinStyle.spanF1Pct}%** | **${linkedinStyle.leaks}/${linkedinStyle.entities}** |`,
  ],
  [
    "model-card rare-surname claim",
    `**${rareSurnames.maskedRecallPct}%** masked recall (${rareSurnames.masked}/${rareSurnames.entities})`,
  ],
  ["model-card historical boundary", `Historical ${historical.release} comparison metrics`],
  [
    "model-card current KBLab original row",
    `| original | **maskera-sv-ner ${contract.release} q4** | **${comparison.normal.maskera.maskedRecallPct}% (${comparison.normal.maskera.masked}/${comparison.corpus.entities})** | ${comparison.normal.maskera.typedF1Pct}% |`,
  ],
  [
    "model-card current KBLab lowercase row",
    `| lowercase | KBLab lowermix fp32 | ${comparison.lowercase.kblab.maskedRecallPct}% (${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}) | ${comparison.lowercase.kblab.typedF1Pct}% |`,
  ],
])
await expectFragments("bench/README.md", [
  ["bench current boundary", `Published ${contract.release} snapshot`],
  [
    "bench current curated",
    `Curated span F1 is ${curated.spanF1Pct}% with ${curated.leaks}/${curated.entities} leaks`,
  ],
  ["bench historical boundary", `Historical snapshot`],
  [
    "bench current KBLab comparison",
    `masked ${comparison.normal.maskera.masked}/${comparison.corpus.entities} with original casing and ${comparison.lowercase.maskera.masked}/${comparison.corpus.entities} lowercased. KBLab lowermix`,
  ],
  [
    "bench LogosGuard comparison",
    `counted ${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.maskera.fullHitRatePct}%) fully removed for Maskera q4 and ${redactionComparison.systems.logosguard.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.logosguard.fullHitRatePct}%) for`,
  ],
])
await expectFragments("docs/TRANSPARENCY.md", [
  ["transparency current release", `current ${contract.release}`],
  [
    "transparency curated claim",
    `${curated.spanF1Pct}% span F1 and ${curated.leaks}/${curated.entities} leaks`,
  ],
  [
    "transparency LinkedIn claim",
    `${linkedinStyle.spanF1Pct}% span F1 with ${linkedinStyle.leaks}/${linkedinStyle.entities}`,
  ],
  [
    "transparency current KBLab Maskera result",
    `Maskera q4 masked ${comparison.normal.maskera.masked}/${comparison.corpus.entities} with original casing and ${comparison.lowercase.maskera.masked}/${comparison.corpus.entities} lowercased`,
  ],
  [
    "transparency current KBLab result",
    `KBLab fp32 masked ${comparison.normal.kblab.masked}/${comparison.corpus.entities} and ${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}.`,
  ],
  [
    "transparency LogosGuard comparison",
    `Maskera ${contract.release} fully removed ${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.maskera.fullHitRatePct}%); LogosGuard ${redactionComparison.systems.logosguard.version} in`,
  ],
])
await expectFragments("docs/PRODUCTION.md", [
  ["production release", `current ${contract.release} release`],
  [
    "production curated claim",
    `${curated.spanF1Pct}% span F1 with ${curated.leaks}/${curated.entities} leaks`,
  ],
  ["production LinkedIn claim", `${linkedinStyle.leaks}/${linkedinStyle.entities}\nleaks`],
  [
    "production current KBLab Maskera result",
    `Maskera masked ${comparison.normal.maskera.masked}/${comparison.corpus.entities} with original casing and\n${comparison.lowercase.maskera.masked}/${comparison.corpus.entities} lowercased`,
  ],
  [
    "production current KBLab result",
    `lowercased; KBLab masked ${comparison.normal.kblab.masked}/${comparison.corpus.entities} and ${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}.`,
  ],
  [
    "production LogosGuard comparison",
    `Maskera ${contract.release} fully removed ${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.maskera.fullHitRatePct}%);\nLogosGuard ${redactionComparison.systems.logosguard.version} in Chrome`,
  ],
])
await expectFragments(whitepaper.source, [
  ["whitepaper version", `Whitepaper v${whitepaper.version}`],
  ["whitepaper artifact bytes", `${bytes} bytes`],
  ["whitepaper revision", artifact.revision],
  ["whitepaper synthetic-gold type F1", `${syntheticGold.typeF1Pct}\\% type $F_1$`],
  ["whitepaper current heading", `Published ${contract.release} release snapshot`],
  ["whitepaper historical heading", `Historical ${historical.release}: curated corpus`],
  [
    "whitepaper current KBLab original row",
    `Original & \\textbf{Maskera ${contract.release} q4} & \\textbf{${comparison.normal.maskera.maskedRecallPct}\\% (${comparison.normal.maskera.masked}/${comparison.corpus.entities})} & ${comparison.normal.maskera.typedF1Pct}\\%`,
  ],
  [
    "whitepaper current KBLab lowercase row",
    `Lowercase & KBLab lowermix fp32 & ${comparison.lowercase.kblab.maskedRecallPct}\\% (${comparison.lowercase.kblab.masked}/${comparison.corpus.entities}) & ${comparison.lowercase.kblab.typedF1Pct}\\%`,
  ],
  [
    "whitepaper LogosGuard Maskera row",
    `\\textbf{Maskera ${contract.release} q4} & \\textbf{${redactionComparison.systems.maskera.fullHitRatePct}\\% (${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations})} & ${redactionComparison.systems.maskera.partialLeaks} & ${redactionComparison.systems.maskera.misses}`,
  ],
  [
    "whitepaper LogosGuard row",
    `LogosGuard ${redactionComparison.systems.logosguard.version} & ${redactionComparison.systems.logosguard.fullHitRatePct}\\% (${redactionComparison.systems.logosguard.fullHits}/${redactionComparison.corpus.annotations}) & ${redactionComparison.systems.logosguard.partialLeaks} & ${redactionComparison.systems.logosguard.misses}`,
  ],
])

// The site shows only the independent benchmark, and reads it straight from
// its result file (apps/demo/src/independentBench.ts), so the copy carries no
// number to drift. Verify that result against the contract.
const { independentComparison } = contract
const actualIndependentSuiteHash = await sha256FileSet(independentComparison.files)
if (actualIndependentSuiteHash !== independentComparison.suiteSha256) {
  drift(
    "independent comparison suite checksum",
    "docs/benchmark-release.json",
    independentComparison.suiteSha256,
    actualIndependentSuiteHash,
  )
}
await expectHash(
  "independent comparison result checksum",
  independentComparison.resultFile,
  independentComparison.resultSha256,
)
const independentResult = await readJson(resolve(repoRoot, independentComparison.resultFile))
for (const [name, corpus] of Object.entries(independentComparison.corpora)) {
  const measured = independentResult.corpora?.[name]
  if (!measured) {
    drift(`independent corpus ${name}`, independentComparison.resultFile, "measured", "missing")
    continue
  }
  if (measured.sha256 !== corpus.sha256) {
    drift(
      `independent corpus ${name} checksum`,
      independentComparison.resultFile,
      corpus.sha256,
      measured.sha256,
    )
  }
  if (measured.texts !== corpus.texts) {
    drift(
      `independent corpus ${name} texts`,
      independentComparison.resultFile,
      corpus.texts,
      measured.texts,
    )
  }
}
{
  const report = await readFile(resolve(repoRoot, "docs/BENCHMARKS.md"), "utf8")
  const expected = replaceSection(report, renderSection(independentResult))
  if (expected !== report) {
    drift(
      "BENCHMARKS.md independent section",
      "docs/BENCHMARKS.md",
      `rendered from ${independentComparison.resultFile}`,
      "stale: run node bench/independent/render-markdown.mjs",
    )
  }
}
const independentNames = independentResult.summary?.maskera?.names
if (independentNames) {
  const formattedCount = `${independentNames.masked.toLocaleString("en-US")}/${independentNames.total.toLocaleString("en-US")}`
  await expectFragments("apps/demo/public/llms.txt", [
    ["llms independent names", `hid ${independentNames.maskedPct}% of names (${formattedCount})`],
  ])
  await expectFragments("README.md", [
    [
      "README independent names",
      `Maskera ${contract.release} hid ${independentNames.maskedPct}% of names (${formattedCount})`,
    ],
  ])
  await expectFragments(whitepaper.source, [
    [
      "whitepaper independent names",
      `hid ${independentNames.maskedPct}\\% of names (${formattedCount})`,
    ],
  ])
  await expectFragments("bench/README.md", [
    [
      "bench independent names",
      `Maskera ${contract.release} q4 hid ${independentNames.maskedPct}% of\n> names (${formattedCount})`,
    ],
  ])
  await expectFragments("docs/TRANSPARENCY.md", [
    [
      "transparency independent names",
      `hid ${independentNames.maskedPct}%\n  of names (${formattedCount})`,
    ],
  ])
}

const optionalExplainer = "docs/FORSTA_MODELLEN.md"
if (existsSync(resolve(repoRoot, optionalExplainer))) {
  await expectFragments(optionalExplainer, [
    [
      "explainer curated claim",
      `curated span-F1 **${curated.spanF1Pct.replace(".", ",")} %** med ${curated.leaks}/${curated.entities} läckor`,
    ],
    [
      "explainer ADR claim",
      `syntetisk ADR span-F1 **${syntheticAdr.spanF1Pct.replace(".", ",")} %** med ${syntheticAdr.leaks}/${syntheticAdr.entities} läckor`,
    ],
    ["explainer historical boundary", `De här tre talen tillhör ${historical.release}-artefakten`],
    [
      "explainer current KBLab comparison",
      `Maskera maskerar ${comparison.normal.maskera.masked}/${comparison.corpus.entities} med`,
    ],
    [
      "explainer LogosGuard comparison",
      `Maskera bort ${redactionComparison.systems.maskera.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.maskera.fullHitRatePct.replace(".", ",")} %) helt och LogosGuard ${redactionComparison.systems.logosguard.fullHits}/${redactionComparison.corpus.annotations} (${redactionComparison.systems.logosguard.fullHitRatePct.replace(".", ",")} %)`,
    ],
  ])
}

await expectJsonEqual(
  "public benchmark contract",
  "apps/demo/public/benchmark-release.json",
  contract,
)
await expectJsonEqual(
  "public benchmark schema",
  "apps/demo/public/benchmark-release.schema.json",
  await readJson(resolve(repoRoot, "docs/benchmark-release.schema.json")),
)
await expectJsonEqual("demo model metadata", "apps/demo/src/model-meta.json", {
  directory: artifact.model,
  onnxBytes: artifact.bytes,
})
await expectFragments("packages/ner/src/index.ts", [
  ["npm model revision pin", `MASKERA_SV_NER_REVISION = "${artifact.revision}"`],
])
await expectFragments("apps/demo/scripts/fetch-model.mjs", [
  ["demo model checksum", `"${artifact.path}": "${artifact.sha256}"`],
])
await expectJsonEqual("maskera package version", "packages/ner/package.json", {
  ...(await readJson(resolve(repoRoot, "packages/ner/package.json"))),
  version: packages.maskera,
})
await expectJsonEqual("core package version", "packages/core/package.json", {
  ...(await readJson(resolve(repoRoot, "packages/core/package.json"))),
  version: packages.core,
})
await expectHash(
  "model-card checksum",
  "training/maskera-sv-ner-card/README.md",
  artifact.modelCardSha256,
)
await expectHash("whitepaper source checksum", whitepaper.source, whitepaper.sourceSha256)
await expectHash("whitepaper PDF checksum", whitepaper.pdf, whitepaper.pdfSha256)

const localModel = `apps/demo/public/models/${artifact.model}/${artifact.path}`
if (existsSync(resolve(repoRoot, localModel))) {
  await expectHash("local q4 model checksum", localModel, artifact.sha256)
  const modelBytes = (await import("node:fs/promises")).stat(resolve(repoRoot, localModel))
  const actualBytes = (await modelBytes).size
  if (actualBytes !== artifact.bytes)
    drift("local q4 model size", localModel, artifact.bytes, actualBytes)
} else if (requireModel) {
  drift("local q4 model", localModel, "checksum-pinned model to exist", "missing")
}

if (errors.length > 0) {
  console.error(`BENCHMARK DRIFT (${errors.length} problem${errors.length === 1 ? "" : "s"})`)
  for (const error of errors) {
    console.error(
      `\n- ${error.label}\n  file: ${error.file}\n  expected: ${JSON.stringify(error.expected)}\n  actual:   ${JSON.stringify(error.actual)}`,
    )
  }
  console.error(
    "\nRun `pnpm sync:benchmarks` for generated contract copies, then update every reported carrier. Deploy/release is blocked.",
  )
  process.exit(1)
}

console.log(
  `benchmark sync: ${contract.release} contract verified across inputs, eval environment, packages, model pins and whitepaper`,
)
