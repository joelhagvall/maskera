#!/usr/bin/env node
/**
 * Grade one or more local Maskera ONNX model directories across every release
 * gate and diagnostic benchmark, then print a side-by-side comparison table
 * and save machine-readable JSON.
 *
 * Usage:
 *   node training/grade_candidate.mjs student-v19-privacy-precision2-onnx student-v20-s1337-onnx
 *   node training/grade_candidate.mjs --out training/.tmp/sweep.json --blind training/.tmp/corpus-blind-v20.mjs <models...>
 */
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const rawArgs = process.argv.slice(2)
let outPath = null
let blindCorpus = null
let modelPath = HERE
const models = []

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i]
  if (arg === "--out" && i + 1 < rawArgs.length) {
    outPath = resolve(process.cwd(), rawArgs[++i])
  } else if (arg === "--blind" && i + 1 < rawArgs.length) {
    blindCorpus = resolve(process.cwd(), rawArgs[++i])
  } else if (arg === "--model-path" && i + 1 < rawArgs.length) {
    modelPath = resolve(process.cwd(), rawArgs[++i])
  } else {
    models.push(arg)
  }
}

if (!models.length) {
  console.error(
    "Usage: node training/grade_candidate.mjs [--out file.json] [--blind corpus.mjs] <modelDir>...",
  )
  process.exit(1)
}

function runCmd(cmd, cmdArgs, cwd, extraEnv = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  return {
    status: res.status ?? 1,
    output: `${res.stdout ?? ""}\n${res.stderr ?? ""}`,
  }
}

function parseNerEval(output) {
  const prec = output.match(/--- span-level \(label-agnostic\) ---[\s\S]*?precision:\s+([\d.]+)%/)
  const rec = output.match(/--- span-level \(label-agnostic\) ---[\s\S]*?recall:\s+([\d.]+)%/)
  const f1 = output.match(/--- span-level \(label-agnostic\) ---[\s\S]*?F1:\s+([\d.]+)%/)
  const lf1 = output.match(/--- labeled ---[\s\S]*?F1:\s+([\d.]+)%/)
  const leaks = output.match(/leaks \(missed\):\s+(\d+)/)
  return {
    precision: prec ? Number(prec[1]) : null,
    recall: rec ? Number(rec[1]) : null,
    spanF1: f1 ? Number(f1[1]) : null,
    labeledF1: lf1 ? Number(lf1[1]) : null,
    leaks: leaks ? Number(leaks[1]) : null,
  }
}

function gradeModel(model) {
  const q4Path = resolve(modelPath, model, "onnx/model_q4.onnx")
  if (!existsSync(q4Path)) {
    throw new Error(`Missing q4 model at ${q4Path}`)
  }
  const bytes = statSync(q4Path).size
  const mb = Number((bytes / 1e6).toFixed(2))
  console.log(`\n=== Grading ${model} (${mb} MB q4) ===`)

  const baseEnv = {
    MASKERA_MODEL: model,
    MASKERA_MODEL_PATH: modelPath,
    MASKERA_AGGREGATE_ONLY: "1",
    MASKERA_F1_FLOOR: "0",
    MASKERA_LEAK_CEIL: "1",
  }

  // 1. Gold gate (apps/demo/scripts/evaluate-candidate-gates.mjs)
  const goldRun = runCmd(
    "node",
    ["scripts/evaluate-candidate-gates.mjs"],
    resolve(ROOT, "apps/demo"),
    baseEnv,
  )
  const goldTypeF1 = goldRun.output.match(/type_f1=([\d.]+)/)
  const goldMasked = goldRun.output.match(/masked_recall=([\d.]+)/)
  const goldPassed = goldRun.status === 0

  // 2. Rare surnames
  const rareRun = runCmd("node", ["packages/ner/eval/benchmark-rare-surnames.mjs"], ROOT, baseEnv)
  const rareMatch = rareRun.output.match(
    /RESULT masked_recall=([\d.]+) per_recall=([\d.]+) leaks=(\d+)\/(\d+)/,
  )

  // 3. Curated, ADR, LinkedIn, Freetext
  const curated = parseNerEval(
    runCmd("node", ["packages/ner/eval/run-eval.mjs"], ROOT, baseEnv).output,
  )
  const adr = parseNerEval(
    runCmd("node", ["packages/ner/eval/run-eval.mjs"], ROOT, {
      ...baseEnv,
      CORPUS_FILE: "./corpus-adr.mjs",
    }).output,
  )
  const linkedin = parseNerEval(
    runCmd("node", ["packages/ner/eval/run-eval.mjs"], ROOT, {
      ...baseEnv,
      CORPUS_FILE: "./corpus-linkedin.mjs",
    }).output,
  )
  const freetext = parseNerEval(
    runCmd("node", ["packages/ner/eval/run-eval.mjs"], ROOT, {
      ...baseEnv,
      CORPUS_FILE: "./corpus-freetext.mjs",
    }).output,
  )

  // 4. Homograph diagnostic
  const homoRun = runCmd("node", ["packages/ner/eval/benchmark-homograph-names.mjs"], ROOT, baseEnv)
  const homoMatch = homoRun.output.match(
    /RESULT leak_rate=([\d.]+) leaks=(\d+)\/(\d+) homograph_leak_rate=([\d.]+) plain_leak_rate=([\d.]+) word_fp=(\d+)\/(\d+)/,
  )

  // 5. Clinical retention diagnostic (if present)
  let clinical = null
  if (existsSync(resolve(ROOT, "packages/ner/eval/benchmark-clinical-retention.mjs"))) {
    const clinRun = runCmd(
      "node",
      ["packages/ner/eval/benchmark-clinical-retention.mjs"],
      ROOT,
      baseEnv,
    )
    const clinMatch = clinRun.output.match(
      /RESULT clean_texts=(\d+)\/(\d+) false_flags=(\d+) control_leaks=(\d+)\/(\d+) domain_leaks=(\d+)\/(\d+)/,
    )
    if (clinMatch) {
      clinical = {
        cleanTexts: Number(clinMatch[1]),
        totalTexts: Number(clinMatch[2]),
        falseFlags: Number(clinMatch[3]),
        controlLeaks: Number(clinMatch[4]),
        domainLeaks: Number(clinMatch[6]),
      }
    }
  }

  // 6. Optional untouched blind evaluation corpus
  let blind = null
  if (blindCorpus && existsSync(blindCorpus)) {
    blind = parseNerEval(
      runCmd("node", ["packages/ner/eval/run-eval.mjs"], ROOT, {
        ...baseEnv,
        CORPUS_FILE: blindCorpus,
      }).output,
    )
  }

  // 7. Release gate summary
  const rareMasked = rareMatch ? Number(rareMatch[1]) : 0
  const releaseGatesPass =
    goldPassed &&
    rareMasked > 0.949 &&
    adr.spanF1 === 100 &&
    adr.leaks === 0 &&
    (curated.spanF1 ?? 0) >= 90 &&
    (curated.leaks ?? 999) <= 16

  return {
    model,
    bytes,
    mb,
    releaseGatesPass,
    gold: {
      passed: goldPassed,
      typeF1: goldTypeF1 ? Number((Number(goldTypeF1[1]) * 100).toFixed(2)) : null,
      maskedRecall: goldMasked ? Number((Number(goldMasked[1]) * 100).toFixed(2)) : null,
    },
    rareSurnames: rareMatch
      ? {
          maskedPct: Number((Number(rareMatch[1]) * 100).toFixed(2)),
          perPct: Number((Number(rareMatch[2]) * 100).toFixed(2)),
          leaks: Number(rareMatch[3]),
        }
      : null,
    curated,
    adr,
    linkedin,
    freetext,
    homograph: homoMatch
      ? {
          homographLeakPct: Number((Number(homoMatch[4]) * 100).toFixed(1)),
          plainLeakPct: Number((Number(homoMatch[5]) * 100).toFixed(1)),
          wordFp: `${homoMatch[6]}/${homoMatch[7]}`,
        }
      : null,
    clinical,
    blind,
  }
}

const results = models.map(gradeModel)

console.log("\n=== SUMMARY TABLE ===")
const cols = [
  "model",
  "MB",
  "gates",
  "curated F1/lk",
  "ADR F1/lk",
  "rare %/lk",
  "LI P/F1",
  "FT P/F1/lk",
  "homo lk%/fp",
  "clin clean/fp",
  ...(blindCorpus ? ["blind F1/lk"] : []),
]
console.log(`| ${cols.join(" | ")} |`)
console.log(`| ${cols.map(() => "---").join(" | ")} |`)
for (const r of results) {
  const row = [
    r.model,
    r.mb.toFixed(1),
    r.releaseGatesPass ? "PASS" : "FAIL",
    `${r.curated.spanF1 ?? "-"}/${r.curated.leaks ?? "-"}`,
    `${r.adr.spanF1 ?? "-"}/${r.adr.leaks ?? "-"}`,
    r.rareSurnames ? `${r.rareSurnames.maskedPct}/${r.rareSurnames.leaks}` : "-",
    `${r.linkedin.precision ?? "-"}/${r.linkedin.spanF1 ?? "-"}`,
    `${r.freetext.precision ?? "-"}/${r.freetext.spanF1 ?? "-"}/${r.freetext.leaks ?? "-"}`,
    r.homograph ? `${r.homograph.homographLeakPct}%/${r.homograph.wordFp}` : "-",
    r.clinical
      ? `${r.clinical.cleanTexts}/${r.clinical.totalTexts} (${r.clinical.falseFlags})`
      : "-",
    ...(blindCorpus ? [`${r.blind?.spanF1 ?? "-"}/${r.blind?.leaks ?? "-"}`] : []),
  ]
  console.log(`| ${row.join(" | ")} |`)
}

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    `${JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2)}\n`,
  )
  console.log(`\nSaved JSON report -> ${outPath}`)
}
