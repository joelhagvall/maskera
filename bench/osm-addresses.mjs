import { createHash } from "node:crypto"

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors"
export const OSM_LICENSE = "Open Database License (ODbL) 1.0"

export const REGIONS = [
  { id: "stockholm", name: "Stockholm", bbox: [59.23, 17.75, 59.46, 18.3] },
  { id: "goteborg", name: "Göteborg", bbox: [57.58, 11.75, 57.82, 12.18] },
  { id: "malmo", name: "Malmö", bbox: [55.5, 12.82, 55.72, 13.22] },
  { id: "linkoping", name: "Linköping", bbox: [58.32, 15.45, 58.48, 15.85] },
  { id: "orebro", name: "Örebro", bbox: [59.2, 15.02, 59.36, 15.4] },
  { id: "vaxjo", name: "Växjö", bbox: [56.8, 14.65, 56.96, 14.95] },
  { id: "visby", name: "Visby", bbox: [57.55, 18.2, 57.72, 18.46] },
  { id: "sundsvall", name: "Sundsvall", bbox: [62.31, 17.15, 62.5, 17.55] },
  { id: "ostersund", name: "Östersund", bbox: [63.1, 14.5, 63.25, 14.85] },
  { id: "umea", name: "Umeå", bbox: [63.75, 20.08, 63.95, 20.5] },
  { id: "lulea", name: "Luleå", bbox: [65.5, 21.9, 65.72, 22.34] },
  { id: "kiruna", name: "Kiruna", bbox: [67.78, 20.0, 68.0, 20.55] },
]

const CHAT_TEMPLATES = [
  (address) => `hej! leveransen ska till ${address}, tack`,
  (address) => `min nya adress är ${address}. kan ni uppdatera den?`,
  (address) => `skicka teknikern till ${address} imorgon bitti`,
  (address) => `det gäller lägenheten på ${address}, portkod saknas`,
  (address) => `jag bor på ${address} nu`,
  (address) => `kan ni ändra leveransadress till ${address}??`,
  (address) => `ADRESS: ${address}\nring när ni är framme`,
  (address) => `hallå, budet hittar inte till ${address}`,
  (address) => `vi ses utanför ${address} vid 14`,
  (address) => `fakturan har fel adress, det ska stå ${address}`,
  (address) => `vart ligger ${address}? chauffören hittar inte`,
  (address) => `flytten går till ${address} på fredag`,
]

const SAFE_COMPONENT = /^[\p{L}\p{N} .'’–—\-/:]+$/u

function cleanComponent(value, maxLength) {
  if (typeof value !== "string") return null
  const clean = value.replace(/\s+/g, " ").trim()
  if (!clean || clean.length > maxLength || !SAFE_COMPONENT.test(clean)) return null
  return clean
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex")
}

export function normalizeElements(elements, region) {
  const addresses = []
  for (const element of elements ?? []) {
    const street = cleanComponent(element.tags?.["addr:street"], 100)
    const houseNumber = cleanComponent(element.tags?.["addr:housenumber"], 24)
    if (!street || !houseNumber || !/\d/u.test(houseNumber)) continue

    // Multiple addresses in one OSM tag cannot be given one unambiguous gold
    // span. Drop them rather than silently choosing one.
    if (houseNumber.includes(",") || houseNumber.includes(";")) continue

    addresses.push({
      osmType: element.type,
      osmId: element.id,
      region: region.name,
      street,
      houseNumber,
    })
  }
  return addresses
}

export function selectAddresses(
  addresses,
  targetTotal,
  regions = REGIONS,
  { selectionSalt = "", excludeKeys = new Set() } = {},
) {
  const unique = new Map()
  for (const address of addresses) {
    const key = addressKey(address)
    if (excludeKeys.has(key)) continue
    const existing = unique.get(key)
    const sourceKey = `${address.osmType}/${address.osmId}/${address.region}`
    const existingSourceKey = existing
      ? `${existing.osmType}/${existing.osmId}/${existing.region}`
      : null
    if (!existing || stableHash(sourceKey) < stableHash(existingSourceKey)) {
      unique.set(key, address)
    }
  }

  const perRegionTarget = Math.ceil(targetTotal / regions.length)
  const selected = []
  const selectedKeys = new Set()
  const leftovers = []

  for (const region of regions) {
    const candidates = [...unique.values()]
      .filter((address) => address.region === region.name)
      .sort((a, b) => {
        const aSource = `${a.osmType}/${a.osmId}/${a.street}/${a.houseNumber}`
        const bSource = `${b.osmType}/${b.osmId}/${b.street}/${b.houseNumber}`
        const aHash = stableHash(selectionSalt ? `${selectionSalt}/${aSource}` : aSource)
        const bHash = stableHash(selectionSalt ? `${selectionSalt}/${bSource}` : bSource)
        return aHash.localeCompare(bHash)
      })
    const perStreet = new Map()
    for (const address of candidates) {
      const streetKey = address.street.toLocaleLowerCase("sv-SE")
      const count = perStreet.get(streetKey) ?? 0
      if (
        selected.length < targetTotal &&
        count < 2 &&
        countRegion(selected, region.name) < perRegionTarget
      ) {
        selected.push(address)
        selectedKeys.add(addressKey(address))
        perStreet.set(streetKey, count + 1)
      } else {
        leftovers.push(address)
      }
    }
  }

  for (const address of leftovers) {
    if (selected.length >= targetTotal) break
    const key = addressKey(address)
    if (selectedKeys.has(key)) continue
    selected.push(address)
    selectedKeys.add(key)
  }
  return selected.slice(0, targetTotal)
}

export function addressKey(address) {
  return `${address.street} ${address.houseNumber}`
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sv-SE")
}

function countRegion(addresses, region) {
  return addresses.reduce((count, address) => count + Number(address.region === region), 0)
}

export function buildCorpus(addresses) {
  return addresses.map((source, index) => {
    const casing = index % 6 === 1 ? "lower" : index % 6 === 2 ? "upper" : "original"
    const original = `${source.street} ${source.houseNumber}`
    const address =
      casing === "lower"
        ? original.toLocaleLowerCase("sv-SE")
        : casing === "upper"
          ? original.toLocaleUpperCase("sv-SE")
          : original
    const text = CHAT_TEMPLATES[index % CHAT_TEMPLATES.length](address)
    const start = text.indexOf(address)
    if (start < 0) throw new Error(`address missing from generated chat text: ${address}`)

    return {
      text,
      gold: [{ start, end: start + address.length, label: "ADDRESS", value: address }],
      source: {
        dataset: "OpenStreetMap",
        osmType: source.osmType,
        osmId: source.osmId,
        region: source.region,
        casing,
      },
    }
  })
}

export function corpusHash(corpus) {
  return stableHash(JSON.stringify(corpus))
}
