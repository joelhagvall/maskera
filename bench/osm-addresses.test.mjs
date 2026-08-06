import assert from "node:assert/strict"
import test from "node:test"
import {
  addressKey,
  buildCorpus,
  corpusHash,
  normalizeElements,
  selectAddresses,
} from "./osm-addresses.mjs"

const regions = [
  { id: "a", name: "A", bbox: [0, 0, 1, 1] },
  { id: "b", name: "B", bbox: [1, 1, 2, 2] },
]

test("normalizeElements keeps usable address tags and drops ambiguous or malformed values", () => {
  const elements = [
    {
      type: "node",
      id: 1,
      tags: { "addr:street": "  Södra   Vägen ", "addr:housenumber": "12B" },
    },
    { type: "way", id: 2, tags: { "addr:street": "Testgatan", "addr:housenumber": "1;3" } },
    { type: "node", id: 3, tags: { "addr:street": "Testgatan", "addr:housenumber": "A" } },
    { type: "node", id: 4, tags: { "addr:street": "<script>", "addr:housenumber": "4" } },
  ]

  assert.deepEqual(normalizeElements(elements, regions[0]), [
    {
      osmType: "node",
      osmId: 1,
      region: "A",
      street: "Södra Vägen",
      houseNumber: "12B",
    },
  ])
})

test("selection is deterministic, region-balanced and caps repeated streets", () => {
  const addresses = []
  for (const region of regions) {
    for (let index = 1; index <= 10; index += 1) {
      addresses.push({
        osmType: "node",
        osmId: `${region.id}-${index}`,
        region: region.name,
        street: index <= 4 ? `${region.name} Testgatan` : `${region.name} Testgata ${index}`,
        houseNumber: String(index),
      })
    }
  }

  const first = selectAddresses(addresses, 12, regions)
  const second = selectAddresses([...addresses].reverse(), 12, regions)
  assert.deepEqual(first, second)
  assert.equal(first.filter((address) => address.region === "A").length, 6)
  assert.equal(first.filter((address) => address.region === "B").length, 6)
  assert.ok(first.filter((address) => address.street.endsWith("Testgatan")).length <= 4)
})

test("salted selection can exclude every address from an earlier corpus", () => {
  const addresses = []
  for (const region of regions) {
    for (let index = 1; index <= 20; index += 1) {
      addresses.push({
        osmType: "node",
        osmId: `${region.id}-${index}`,
        region: region.name,
        street: `${region.name} Gata ${index}`,
        houseNumber: String(index),
      })
    }
  }

  const development = selectAddresses(addresses, 12, regions)
  const excludeKeys = new Set(development.map(addressKey))
  const holdout = selectAddresses(addresses, 12, regions, {
    selectionSalt: "locked-before-run",
    excludeKeys,
  })

  assert.equal(holdout.length, 12)
  assert.ok(holdout.every((address) => !excludeKeys.has(addressKey(address))))
  assert.notDeepEqual(holdout, development)
})

test("buildCorpus emits exact UTF-16 gold spans in varied chat casing", () => {
  const addresses = [
    { osmType: "node", osmId: 1, region: "A", street: "Södra Provdatavägen", houseNumber: "12B" },
    { osmType: "node", osmId: 2, region: "B", street: "Testkorpusgatan", houseNumber: "4" },
    { osmType: "way", osmId: 3, region: "B", street: "Maskerabjörkvägen", houseNumber: "7A" },
  ]
  const corpus = buildCorpus(addresses)

  assert.equal(corpus[0].gold[0].value, "Södra Provdatavägen 12B")
  assert.equal(corpus[1].gold[0].value, "testkorpusgatan 4")
  assert.equal(corpus[2].gold[0].value, "MASKERABJÖRKVÄGEN 7A")
  for (const doc of corpus) {
    const gold = doc.gold[0]
    assert.equal(doc.text.slice(gold.start, gold.end), gold.value)
  }
  assert.equal(corpusHash(corpus), corpusHash(buildCorpus(addresses)))
})
