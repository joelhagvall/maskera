#!/usr/bin/env node
/**
 * Build a git-ignored Swedish chat/address corpus from real OpenStreetMap
 * address points. No people or OSM user metadata are fetched.
 *
 *   node bench/fetch-osm-addresses.mjs
 *   OSM_ADDRESS_COUNT=250 node bench/fetch-osm-addresses.mjs
 *   OSM_CORPUS_NAME=osm-addresses-holdout OSM_ADDRESS_SALT=<precommitted> \
 *     OSM_EXCLUDE_CORPUS=bench/corpora/osm-addresses.json node bench/fetch-osm-addresses.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  addressKey,
  buildCorpus,
  corpusHash,
  normalizeElements,
  OSM_ATTRIBUTION,
  OSM_LICENSE,
  REGIONS,
  selectAddresses,
} from "./osm-addresses.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, "corpora")
const CACHE_DIR = join(OUT_DIR, "osm-address-cache")
const TARGET_COUNT = Number(process.env.OSM_ADDRESS_COUNT ?? 500)
const CORPUS_NAME = process.env.OSM_CORPUS_NAME ?? "osm-addresses"
const SELECTION_SALT = process.env.OSM_ADDRESS_SALT ?? ""
const EXCLUDE_CORPUS = process.env.OSM_EXCLUDE_CORPUS
const OVERPASS_URL =
  process.env.OVERPASS_URL ?? "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
const USER_AGENT = "maskera-address-benchmark/1.0 (https://github.com/joelhagvall/maskera)"
const REFRESH_CACHE = process.env.OSM_REFRESH === "1"
let lastRequestAt = 0

if (!Number.isInteger(TARGET_COUNT) || TARGET_COUNT < 12 || TARGET_COUNT > 2_000) {
  throw new Error("OSM_ADDRESS_COUNT must be an integer between 12 and 2000")
}
if (!/^[a-z0-9][a-z0-9-]*$/u.test(CORPUS_NAME)) {
  throw new Error("OSM_CORPUS_NAME must contain only lowercase letters, digits and hyphens")
}

const excludeKeys = new Set()
if (EXCLUDE_CORPUS) {
  const excluded = JSON.parse(readFileSync(EXCLUDE_CORPUS, "utf8"))
  if (!Array.isArray(excluded)) throw new Error("OSM_EXCLUDE_CORPUS must contain a corpus array")
  for (const document of excluded) {
    for (const gold of document.gold ?? []) {
      if (gold.label !== "ADDRESS" || typeof gold.value !== "string") continue
      excludeKeys.add(gold.value.replace(/\s+/g, " ").trim().toLocaleLowerCase("sv-SE"))
    }
  }
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function throttle() {
  const remaining = 3_000 - (Date.now() - lastRequestAt)
  if (remaining > 0) await wait(remaining)
  lastRequestAt = Date.now()
}

async function fetchRegion(region, limit) {
  const cacheFile = join(CACHE_DIR, `${region.id}.json`)
  if (!REFRESH_CACHE && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, "utf8"))
  }

  const bbox = region.bbox.join(",")
  const query = `[out:json][timeout:60];nwr["addr:street"]["addr:housenumber"](${bbox});out tags ${limit};`
  const body = new URLSearchParams({ data: query })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await throttle()
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": USER_AGENT,
      },
      body,
    })
    if (response.ok) {
      const payload = await response.json()
      const snapshot = {
        osmTimestamp: payload.osm3s?.timestamp_osm_base ?? null,
        returned: payload.elements?.length ?? 0,
        addresses: normalizeElements(payload.elements, region),
      }
      writeFileSync(cacheFile, JSON.stringify(snapshot, null, 1))
      return snapshot
    }
    const retryAfter = Number(response.headers.get("retry-after"))
    await response.body?.cancel()
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(`Overpass failed for ${region.name}: HTTP ${response.status}`)
    }
    const delay = Number.isFinite(retryAfter)
      ? Math.max(5_000, retryAfter * 1_000)
      : 5_000 * 2 ** attempt
    await wait(Math.min(delay, 30_000))
  }
  throw new Error(`Overpass retries exhausted for ${region.name}`)
}

const rawAddresses = []
const snapshots = []
const perRegionLimit = Math.max(250, Math.ceil(TARGET_COUNT / REGIONS.length) * 8)
mkdirSync(CACHE_DIR, { recursive: true })
for (const region of REGIONS) {
  process.stdout.write(`fetching ${region.name} ... `)
  const snapshot = await fetchRegion(region, perRegionLimit)
  rawAddresses.push(...snapshot.addresses)
  snapshots.push({
    region: region.name,
    bbox: region.bbox,
    osmTimestamp: snapshot.osmTimestamp,
    returned: snapshot.returned,
    usable: snapshot.addresses.length,
  })
  console.log(`${snapshot.addresses.length} usable`)
}

const selected = selectAddresses(rawAddresses, TARGET_COUNT, REGIONS, {
  selectionSalt: SELECTION_SALT,
  excludeKeys,
})
if (selected.length < TARGET_COUNT) {
  throw new Error(`only found ${selected.length} unique usable addresses; wanted ${TARGET_COUNT}`)
}
if (selected.some((address) => excludeKeys.has(addressKey(address)))) {
  throw new Error("excluded address reached the selected corpus")
}
const corpus = buildCorpus(selected)
const hash = corpusHash(corpus)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, `${CORPUS_NAME}.json`), JSON.stringify(corpus, null, 1))
writeFileSync(
  join(OUT_DIR, `${CORPUS_NAME}.meta.json`),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "OpenStreetMap",
      sourceUrl: "https://www.openstreetmap.org",
      overpassUrl: OVERPASS_URL,
      attribution: OSM_ATTRIBUTION,
      license: OSM_LICENSE,
      corpusSha256: hash,
      corpusName: CORPUS_NAME,
      selectionSalt: SELECTION_SALT || null,
      excludedCorpus: EXCLUDE_CORPUS ?? null,
      excludedAddresses: excludeKeys.size,
      documents: corpus.length,
      regions: snapshots,
    },
    null,
    1,
  ),
)

console.log(`\n${CORPUS_NAME}: ${corpus.length} docs / ${corpus.length} address entities`)
console.log(`sha256: ${hash}`)
console.log(`attribution: ${OSM_ATTRIBUTION}; ${OSM_LICENSE}`)
console.log(`wrote ${join(OUT_DIR, `${CORPUS_NAME}.json`)}`)
