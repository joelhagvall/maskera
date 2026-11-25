#!/usr/bin/env node
/**
 * Gemini-assisted synthetic helper for Maskera v20.
 *
 * Uses GEMINI_API_KEY (for example from Google AI Ultra monthly AI Studio
 * credits) in two strictly separated modes:
 *
 *   1. --mode blind-eval (default)
 *      Generates a brand-new, untouched blind held-out Swedish NER evaluation
 *      corpus across realistic domains (clinical notes, lowercase support chat
 *      with homograph names, recruiter/LinkedIn, legal/authority, informal
 *      chat, ALL-CAPS logistics). Every item is filtered through
 *      privacy_guard.mjs, synthetic-ADR checks, rare-surname checks, and
 *      exact span verification.
 *      NEVER tune, iterate, or pick checkpoints on this file. Score ONCE on
 *      the final selected candidate vs baseline.
 *
 *   2. --mode templates
 *      Generates candidate Swedish template families with {PER}/{LOC}/{ORG}/
 *      {ADR} slots for manual review before editing generate_data.mjs. Never
 *      writes directly to training/data/*.jsonl so the fail-closed
 *      privacy-attestation chain stays intact.
 *
 * Usage:
 *   GEMINI_API_KEY=... node training/gemini_synth_helper.mjs --mode blind-eval
 *   GEMINI_API_KEY=... node training/gemini_synth_helper.mjs --mode templates
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { assertSyntheticAddressSpans, trainingPrivacyIssues } from "./privacy_guard.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const getArg = (flag, fallback) => {
  const index = args.indexOf(flag)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback
}

const MODE = getArg("--mode", "blind-eval")
const MODEL = getArg("--model", process.env.GEMINI_MODEL ?? "gemini-3-flash-preview")
const PER_CATEGORY = Number(getArg("--per-category", "15"))
const OUT = getArg(
  "--out",
  MODE === "templates"
    ? resolve(HERE, ".tmp/gemini-template-candidates.json")
    : resolve(HERE, ".tmp/corpus-blind-v20.mjs"),
)
const API_KEY = process.env.GEMINI_API_KEY

if (!["blind-eval", "templates"].includes(MODE)) {
  console.error(`Unsupported --mode "${MODE}". Use "blind-eval" or "templates".`)
  process.exit(1)
}
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY in environment.")
  process.exit(1)
}

const VALID_LABELS = new Set(["PERSON", "LOCATION", "ORGANIZATION", "ADDRESS"])

const RARE_SURNAMES = new Set(
  existsSync(resolve(HERE, "eval/rare-surnames.txt"))
    ? [
        ...readFileSync(resolve(HERE, "eval/rare-surnames.txt"), "utf8").matchAll(
          /\[PER:([^\]]+)\]/g,
        ),
      ].map((m) => m[1].toLowerCase())
    : [],
)

const TRAIN_SURFACES = new Set(
  existsSync(resolve(HERE, "data/train.jsonl"))
    ? readFileSync(resolve(HERE, "data/train.jsonl"), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line).tokens.join(" ").toLowerCase())
    : [],
)

const CATEGORIES = [
  {
    id: "clinical-telegraphic",
    description:
      "Short Swedish telegraphic clinical notes: half completely PII-free (with diagnoses, body parts, procedures, drugs, and medical eponyms like Parkinsons sjukdom or Crohns sjukdom that must NOT be annotated as entities) and half containing fictional Swedish patient/doctor names, clinics, and cities.",
  },
  {
    id: "lowercase-chat-homographs",
    description:
      "All-lowercase informal Swedish support/chat messages (typos and casual punctuation allowed). Include both homograph Swedish given names used as actual people (PERSON) and ordinary-word uses of words like dag, liv, bo, sten, klara, max, bror, tom, axel (NOT annotated).",
  },
  {
    id: "linkedin-and-work",
    description:
      "Swedish LinkedIn/recruiter posts, job updates, and workplace emails. Include job titles, tech terms (AI, fintech, utvecklare), venues (mässan, caféet) that must NOT be annotated, alongside fictional people, employers, and cities.",
  },
  {
    id: "legal-and-municipal",
    description:
      "Swedish municipal, authority, and legal prose with multi-word authorities, courts, Swedish regions/landskap, and synthetic street addresses.",
  },
  {
    id: "allcaps-and-short-orgs",
    description:
      "Mixed ALL-CAPS alerts, SMS-style logistics notices, and short Swedish/Nordic brand/company names in lowercase or ALL CAPS, plus ordinary words in ALL CAPS that must NOT be annotated.",
  },
]

async function callGeminiJson(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(API_KEY)}`
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 1024 },
          },
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) throw new Error("Gemini API returned empty response")
        return JSON.parse(text)
      }
      const body = await response.text()
      if ((response.status === 503 || response.status === 429) && attempt < 4) {
        const delayMs = response.status === 429 ? 20_000 : attempt * 4000
        await new Promise((r) => setTimeout(r, delayMs))
        continue
      }
      throw new Error(`Gemini API HTTP ${response.status}: ${body.slice(0, 400)}`)
    } catch (err) {
      if (attempt < 4 && (err?.name === "TimeoutError" || err?.name === "AbortError")) {
        continue
      }
      throw err
    }
  }
}

function validateBlindDoc(doc) {
  if (!doc || typeof doc.text !== "string" || !Array.isArray(doc.entities)) {
    return "malformed-doc"
  }
  const text = doc.text.trim()
  if (text.length < 15 || text.length > 350) return "length-out-of-range"
  const tokens = text.split(/\s+/)
  const issues = trainingPrivacyIssues(tokens)
  if (issues.length) return `privacy:${issues.join(",")}`

  const lower = text.toLowerCase()
  if (TRAIN_SURFACES.has(lower)) return "duplicate-of-train"
  for (const rare of RARE_SURNAMES) {
    if (rare.length >= 4 && lower.includes(rare)) return "contains-heldout-rare-surname"
  }

  for (const entity of doc.entities) {
    if (
      !entity ||
      typeof entity.value !== "string" ||
      !entity.value.trim() ||
      !VALID_LABELS.has(entity.label)
    ) {
      return "invalid-entity"
    }
    if (!text.includes(entity.value)) return "entity-not-in-text"
    if (entity.label === "ADDRESS") {
      const adrTokens = entity.value.trim().split(/\s+/)
      const adrTags = adrTokens.map((_, idx) => (idx === 0 ? "B-ADR" : "I-ADR"))
      try {
        assertSyntheticAddressSpans(adrTokens, adrTags, "blind-eval")
      } catch {
        return "address-missing-synthetic-marker"
      }
    }
  }
  return null
}

async function generateBlindEval() {
  const accepted = []
  const rejected = {}

  for (const category of CATEGORIES) {
    const prompt = [
      `Generate ${PER_CATEGORY} completely fictional Swedish NER evaluation examples for category "${category.id}".`,
      `Category brief: ${category.description}`,
      "",
      "Strict rules:",
      '1. Output a JSON array of objects: [{"id": "...", "category": "...", "text": "...", "entities": [{"value": "...", "label": "PERSON|LOCATION|ORGANIZATION|ADDRESS"}]}].',
      "2. Every ADDRESS entity MUST contain one of these explicit synthetic markers: Maskera, Provdata, Fiktiv, Syntet, Test, Exempeldata (for example 'Maskeragatan 14' or 'Fiktivvägen 8B'). Never use real Swedish street names.",
      "3. NEVER include any phone number, email address, URL, @handle, personnummer, org.nr, postal code (5 digits), IBAN, bankgiro, OCR, UUID, IP address, or vehicle registration plate.",
      "4. Every entity.value must match an EXACT substring of text. Use empty entities [] for PII-free negative examples.",
      "5. Write natural, varied Swedish. Do NOT use em dashes.",
    ].join("\n")

    process.stdout.write(`Generating ${category.id} (${PER_CATEGORY} docs)... `)
    const items = await callGeminiJson(prompt)
    if (!Array.isArray(items)) {
      console.log("skipped (non-array response)")
      continue
    }
    let kept = 0
    for (const [idx, item] of items.entries()) {
      const reason = validateBlindDoc(item)
      if (reason) {
        rejected[reason] = (rejected[reason] ?? 0) + 1
        continue
      }
      accepted.push({
        id: `${category.id}-${String(idx + 1).padStart(2, "0")}`,
        category: category.id,
        text: item.text.trim(),
        entities: item.entities.map((e) => ({ value: e.value, label: e.label })),
      })
      kept++
    }
    console.log(`kept ${kept}/${items.length}`)
  }

  mkdirSync(dirname(OUT), { recursive: true })
  const header = [
    "/**",
    ` * Untouched blind held-out Swedish NER evaluation corpus (generated ${new Date().toISOString().slice(0, 10)} via ${MODEL}).`,
    " * RULE: NEVER use these examples to tune templates, doses, or seed selection.",
    " * Score ONCE on the final winning v20 candidate vs shipped v19 baseline.",
    " */",
    `export const corpus = ${JSON.stringify(accepted, null, 2)}`,
    "",
  ].join("\n")
  writeFileSync(OUT, header, "utf8")
  console.log(`\nWrote ${accepted.length} verified blind-eval docs -> ${OUT}`)
  if (Object.keys(rejected).length) {
    console.log("Filtered out:", rejected)
  }
}

async function generateTemplates() {
  const prompt = [
    "Propose 40 natural, diverse Swedish sentence templates for synthetic NER training.",
    "Allowed placeholders ONLY: {PER}, {LOC}, {ORG}, {ADR}, {SHORTORG}, {REGION}, {CLINDIAG}, {CLINSYMP}, {CLINBODY}, {CLINEPONYM}, {SOCIALTERM}.",
    "Focus on four registers: telegraphic healthcare notes (both with and without names), casual lowercase support chat, LinkedIn/recruiter posts with job titles and tech buzzwords, and ALL-CAPS logistics/notification messages.",
    "Rules: never include phone numbers, emails, URLs, postal codes, personnummer, or real street names. No em dashes.",
    'Return a JSON object: {"templates": [{"register": "...", "template": "...", "rationale": "..."}]}.',
  ].join("\n")

  const result = await callGeminiJson(prompt)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  const count = Array.isArray(result?.templates) ? result.templates.length : 0
  console.log(`Wrote ${count} template candidates for manual review -> ${OUT}`)
}

if (MODE === "blind-eval") {
  await generateBlindEval()
} else {
  await generateTemplates()
}
