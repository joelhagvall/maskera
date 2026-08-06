import assert from "node:assert/strict"
import test from "node:test"

import {
  assertSyntheticAddressSpans,
  assertTrainingRowPrivacy,
  trainingPrivacyIssues,
} from "./privacy_guard.mjs"

const issues = (...tokens) => trainingPrivacyIssues(tokens)

test("accepts synthetic prose without structured identifiers", () => {
  assert.deepEqual(issues("Ring", "det", "reserverade", "testnumret"), [])
  assert.deepEqual(issues("org.nr", "anges", "separat"), [])
  assert.deepEqual(issues("angivet", "testbankgiro"), [])
})

test("rejects an IBAN-shaped value without storing one as a source literal", () => {
  const value = ["SE", "35", "5000", "0000", "0549", "1000", "0003"].join("")
  assert.ok(issues(value).includes("iban-or-account"))
})

test("rejects personal, contact, network and account identifiers", () => {
  const identity = ["850601", "-", "2387"].join("")
  const phone = ["070", "555", "12", "34"].join("-")
  const ip = ["8", "8", "4", "4"].join(".")
  const ipv6 = ["2001", "db8", "0", "0", "0", "0", "0", "1"].join(":")
  const url = ["https", "://", "person.example"].join("")
  const email = ["person", "@", "example.se"].join("")
  const reservedEmail = ["person", "@", "example.com"].join("")

  assert.ok(issues(identity).includes("identity-number"))
  assert.ok(issues(phone).includes("phone-number"))
  assert.ok(issues(ip).includes("ip-address"))
  assert.ok(issues(ipv6).includes("ip-address"))
  assert.ok(issues(url).includes("url"))
  assert.ok(issues(email).includes("email"))
  assert.ok(issues(reservedEmail).includes("email"))
})

test("rejects registry, device, payment and location identifiers", () => {
  const registration = ["ABC", "12", "D"].join("")
  const uuid = ["b3d27a10", "4a5b", "4c6d", "8e7f", "0123456789ab"].join("-")
  const mac = ["02", "00", "5e", "10", "00", "00"].join(":")
  const postalCode = ["123", "45"].join("")
  const payment = ["bankgiro", "991", "23"].join(" ")

  assert.ok(issues(registration).includes("vehicle-identifier"))
  assert.ok(issues(uuid).includes("record-identifier"))
  assert.ok(issues(mac).includes("device-identifier"))
  assert.ok(issues(postalCode).includes("postal-code"))
  assert.ok(issues(payment).includes("payment-identifier"))
})

test("fail-closed diagnostics never include the rejected value", () => {
  const value = ["person", "@", "example.se"].join("")
  assert.throws(
    () => assertTrainingRowPrivacy(["Kontakta", value], "row 1"),
    (error) =>
      error instanceof Error && error.message.includes("email") && !error.message.includes(value),
  )
})

test("requires an explicit synthetic marker in every address span", () => {
  assert.doesNotThrow(() =>
    assertSyntheticAddressSpans(
      ["Bor", "på", "Maskeragatan", "12"],
      ["O", "O", "B-ADR", "I-ADR"],
      "row 1",
    ),
  )
  assert.throws(
    () =>
      assertSyntheticAddressSpans(
        ["Bor", "på", "gatunamnet", "12"],
        ["O", "O", "B-ADR", "I-ADR"],
        "row 2",
      ),
    (error) =>
      error instanceof Error &&
      error.message.includes("synthetic marker") &&
      !error.message.includes("gatunamnet"),
  )
})
