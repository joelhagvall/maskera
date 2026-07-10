#!/usr/bin/env node
/**
 * Blindfold (@blindfold/sdk) predictions, LOCAL mode: no API key, the regex
 * scanner that ships in the npm package. Configured for its best shot at
 * Swedish text: locales ["se", "eu"] (default is ["us"]) and an unknown policy
 * name, which the local scanner treats as "detect all entities".
 *
 * KNOWN LIMITATION (report it, don't hide it): Blindfold's local mode is
 * regex/checksum only. Person names, organizations and addresses require
 * their cloud NLP API (paid, API key), which this bench does not test. So the
 * expected local score on free-text gold sets is ~0 recall; that IS the
 * datapoint: the free-text entities are exactly what the local tier cannot do.
 *
 * NOTE: @blindfold/sdk@1.0.2 has a packaging bug: dist/policies.json is
 * missing from the npm tarball, and the ESM build references a bare
 * `__dirname`. setup: fetch policies.json into dist/ (see bench/README) and
 * import the CJS build via createRequire.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, "noop.js"))
const { Blindfold } = require("@blindfold/sdk")

const CORPORA = ["curated", "adr", "gold-real"]
mkdirSync(join(HERE, "out"), { recursive: true })

// Only these map into the gold label space; everything else (phone, email,
// personnummer, IBAN…) is out of scope for these free-text gold sets and is
// dropped so it can't count as a false positive.
const TYPE_MAP = {
  Person: "PERSON",
  Organization: "ORGANIZATION",
  Address: "ADDRESS",
  Location: "LOCATION",
  City: "LOCATION",
}

const bf = new Blindfold({ locales: ["se", "eu"] })

for (const name of CORPORA) {
  const gold = JSON.parse(readFileSync(join(HERE, "corpora", `${name}.json`), "utf8"))
  const docs = []
  for (const doc of gold) {
    // Unknown policy name => local scanner detects ALL entity types.
    const r = await bf.detect(doc.text, { policy: "all_local" })
    const spans = (r.detected_entities ?? [])
      .filter((e) => TYPE_MAP[e.type])
      .map((e) => ({ start: e.start, end: e.end, label: TYPE_MAP[e.type] }))
    docs.push({ text: doc.text, spans })
  }
  const out = join(HERE, "out", `${name}.blindfold-local.json`)
  writeFileSync(out, JSON.stringify({ system: "blindfold-local", corpus: name, docs }, null, 1))
  console.log(`${name}: ${docs.length} docs -> ${out}`)
}
