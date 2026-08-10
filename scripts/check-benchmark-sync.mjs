#!/usr/bin/env node
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import Ajv2020 from "ajv/dist/2020.js"
import {
  contractPath as defaultContractPath,
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

requireValue("schemaVersion", 1, contract.schemaVersion)
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
]) {
  if (!/^[a-f0-9]{64}$/.test(value ?? ""))
    drift(label, "docs/benchmark-release.json", "64 lowercase hex characters", value)
}

const { artifact, evaluation, historical, metrics, packages, whitepaper } = contract
const { curated, syntheticAdr, linkedinStyle, syntheticGold, rareSurnames } = metrics
const bytes = formatBytes(artifact.bytes)

await expectFragments("docs/BENCHMARKS.md", [
  ["published date", `**Published:** ${contract.publishedAt}`],
  ["artifact sha", `sha256 \`${artifact.sha256}\``],
  ["artifact revision", `Hub revision \`${artifact.revision}\`, ${bytes} bytes`],
  ["release reproduction command", `\`${evaluation.command}\``],
  ["evaluation suite checksum", `\`${evaluation.suiteSha256}\``],
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
    `Historical ${historical.release} snapshot — not a ${contract.release} result.`,
  ],
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

await expectFragments("training/README.md", [
  [
    "training synthetic-gold row",
    `| synthetic gold | type F1 ${syntheticGold.typeF1Pct}%; type recall ${syntheticGold.typeRecallPct}%; masked recall ${syntheticGold.maskedRecallPct}% |`,
  ],
  ["training artifact revision", artifact.revision],
])
await expectFragments("README.md", [
  [
    "root curated claim",
    `span F1 **${curated.spanF1Pct}%** on curated (${curated.leaks}/${curated.entities} leaks)`,
  ],
  ["root ADR claim", `**${syntheticAdr.spanF1Pct}%**`],
  ["root LinkedIn claim", `**${linkedinStyle.spanF1Pct}%**`],
  ["root historical boundary", `dated public-model comparison belongs to ${historical.release}`],
])
await expectFragments("packages/ner/README.md", [
  [
    "package curated claim",
    `curated set ${contract.release} reaches ${curated.spanF1Pct}% span F1 with ${curated.leaks}/${curated.entities} leaks`,
  ],
  [
    "package LinkedIn claim",
    `LinkedIn-style set it reaches ${linkedinStyle.spanF1Pct}% with ${linkedinStyle.leaks}/${linkedinStyle.entities} leaks`,
  ],
  [
    "package historical boundary",
    `historical ${historical.release} scored ${historical.curated.spanF1Pct}% span-F1`,
  ],
])
await expectFragments("training/maskera-sv-ner-card/README.md", [
  ["model-card current heading", `Published privacy-clean ${contract.release}`],
  [
    "model-card curated claim",
    `curated span F1 ${curated.spanF1Pct}% with ${curated.leaks}/${curated.entities} leaks`,
  ],
  ["model-card LinkedIn claim", `LinkedIn-style span F1 ${linkedinStyle.spanF1Pct}% with`],
  [
    "model-card rare-surname claim",
    `${rareSurnames.maskedRecallPct}% (${rareSurnames.masked}/${rareSurnames.entities})`,
  ],
  ["model-card historical boundary", `${historical.release} comparison metrics`],
])
await expectFragments("apps/demo/public/llms.txt", [
  [
    "llms curated claim",
    `curated span F1 ${curated.spanF1Pct}% with ${curated.leaks}/${curated.entities} leaks`,
  ],
  [
    "llms ADR claim",
    `span F1 ${syntheticAdr.spanF1Pct}% with ${syntheticAdr.leaks}/${syntheticAdr.entities} leaks`,
  ],
  [
    "llms LinkedIn claim",
    `LinkedIn-style span F1 ${linkedinStyle.spanF1Pct}% with ${linkedinStyle.leaks}/${linkedinStyle.entities} leaks`,
  ],
  ["llms historical boundary", `Historical ${historical.release} public-model comparisons`],
])
await expectFragments("bench/README.md", [
  ["bench current boundary", `Published ${contract.release} snapshot`],
  [
    "bench current curated",
    `Curated span F1 is ${curated.spanF1Pct}% with ${curated.leaks}/${curated.entities} leaks`,
  ],
  ["bench historical boundary", `Historical snapshot`],
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
])
await expectFragments("docs/PRODUCTION.md", [
  ["production release", `current ${contract.release} release`],
  [
    "production curated claim",
    `${curated.spanF1Pct}% span F1 with ${curated.leaks}/${curated.entities} leaks`,
  ],
  ["production LinkedIn claim", `${linkedinStyle.leaks}/${linkedinStyle.entities}\nleaks`],
])
await expectFragments(whitepaper.source, [
  ["whitepaper version", `Whitepaper v${whitepaper.version}`],
  ["whitepaper artifact bytes", `${bytes} bytes`],
  ["whitepaper revision", artifact.revision],
  ["whitepaper synthetic-gold type F1", `${syntheticGold.typeF1Pct}\\% type $F_1$`],
  ["whitepaper current heading", `Published ${contract.release} release snapshot`],
  ["whitepaper historical heading", `Historical ${historical.release}: curated corpus`],
])

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
  `benchmark sync: ${contract.release} contract verified across source, packages, model pins and whitepaper`,
)
