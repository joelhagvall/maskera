#!/usr/bin/env node
/**
 * Reject routable or potentially real structured identifiers in repository
 * fixtures, examples and documentation (tracked and unignored new files).
 *
 * The allowlist is intentionally small and source-backed. Add a value only
 * when its owner publishes it for testing/documentation; "made up", Luhn-valid
 * or absent from a public lookup is not enough.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"

const repoFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)

const SKIP_PREFIXES = ["apps/demo/public/models/", "apps/demo/reports/", "training/data/"]
const SKIP_FILES = new Set(["pnpm-lock.yaml", "apps/demo/public/whitepaper.pdf"])

// Skatteverket open test-person datasets. Ten-digit forms are accepted by
// matching the suffix of the corresponding twelve-digit value.
// https://www.skatteverket.se/omoss/digitalasamarbeten/omvaraoppnadata/testpersonnummersomoppendata.4.5b35a6251761e6914202df9.html
const TEST_PERSONNUMMER = new Set([
  "190001019801",
  "197811012397",
  "198506012387",
  "198506232381",
  "199001012385",
  "199912012391",
  "200203012398",
])
const TEST_SAMORDNINGSNUMMER = new Set(["196403722397", "197001782395"])

// Skatteverket's Navet test certificate identifies the fictitious "Kommun A"
// as 162021004748 (the 16 prefix + organisationsnummer 2021004748).
// https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-folkbokforingsuppgifter-for-offentliga-aktorer-v3/pdf/1.0.3/tjanstebeskrivning-folkbokforingsuppgift-offentliga-aktorer-v3.pdf
const TEST_ORGANISATIONSNUMMER = new Set(["2021004748"])

// PTS reserves these ranges for fictional use.
// https://pts.se/internet-och-telefoni/telefonnummer-och-adressering/telefonnummer-till-bocker-och-filmer/
const FICTIONAL_PHONE_RANGES = [
  ["0701740605", "0701740699"],
  ["0313900600", "0313900699"],
  ["0406280400", "0406280499"],
  ["0846500400", "0846500499"],
  ["0980319200", "0980319299"],
]

// Published test/example data from the identifier owners.
// https://www.bankgirot.se/kundservice/exempelfiler/
// https://www.bankgirot.se/globalassets/dokument/exempelfiler/bankgiro-link/bankgirolink_lon_ki_exempelfil_sv.txt
// https://www.nordea.se/foretag/produkter/betala/total-in-bas.html
// https://www.nordea.se/Images/154-16337/PG_TESTFIL_TL1_med_refsok.txt
// https://www.swedbank.se/foretag/betala-och-ta-betalt/betala/fakturahantering/betala-via-fil/mig.html
// https://docs.stripe.com/testing
const TEST_IBANS = new Set(["SE4280000890119146168423"]) // Swedbank Validex test account
const TEST_BANKGIRO = new Set(["9912346", "09912346"]) // Bankgirot test value + fixed-width padding
const TEST_PLUSGIRO = new Set(["9201005"]) // Nordea Total IN test file
const TEST_CARDS = new Set(["4242424242424242"]) // Stripe test card

// PostNord uses 123 45 Staden in its public addressing guide.
// https://www.postnord.se/siteassets/-pdf/ovrigt/skicka-ratt-med-postnord-20260126.pdf
const TEST_POSTNUMMER = new Set(["12345"])

// Real operational contact details are allowed explicitly. Every other email
// literal must use an IANA-reserved example domain or the reserved .test TLD.
const OPERATIONAL_EMAILS = new Set(["hej@maskera.dev", "work@joelhagvall.com"])

// User-facing examples and unit fixtures use conspicuously fictional street
// names. Evaluation corpora are excluded here: their public place vocabulary
// is a deliberate model-quality probe, never imported private records.
const SYNTHETIC_STREETS = [
  "maskeragatan",
  "maskeragränd",
  "maskeras gata",
  "maskeratorget",
  "maskeravägen",
  "påhittsgatan",
  "påhittsvägen",
]

function requiresSyntheticStreet(file) {
  if (file.endsWith(".css")) return false
  return (
    file.startsWith("apps/demo/") ||
    file.startsWith("examples/") ||
    file.startsWith("packages/core/test/") ||
    file.startsWith("packages/ner/test/") ||
    file === "packages/core/README.md" ||
    file === "packages/core/src/detectors/index.ts"
  )
}

function luhnValid(digits) {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return digits.length > 0 && sum % 10 === 0
}

function dateKind(value) {
  const match = value.match(/^(?:\d{2})?(\d{2})(\d{2})(\d{2})[-+]?(\d{4})$/)
  if (!match) return undefined
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return undefined
  const core = value.replace(/\D/g, "").slice(-10)
  if (!luhnValid(core)) return undefined
  if (day >= 1 && day <= 31) return "personnummer"
  if (day >= 61 && day <= 91) return "samordningsnummer"
  return undefined
}

function organisationCore(value) {
  const digits = value.replace(/\D/g, "")
  const core = digits.length === 12 ? digits.slice(2) : digits
  if (core.length !== 10 || Number(core[2]) < 2 || !luhnValid(core)) return undefined
  return core
}

function approvedIdentity(value, kind) {
  const digits = value.replace(/\D/g, "")
  if (kind === "personnummer") {
    return [...TEST_PERSONNUMMER].some((testValue) =>
      digits.length === 12 ? testValue === digits : testValue.endsWith(digits),
    )
  }
  if (kind === "samordningsnummer") {
    return [...TEST_SAMORDNINGSNUMMER].some((testValue) =>
      digits.length === 12 ? testValue === digits : testValue.endsWith(digits),
    )
  }
  const core = organisationCore(value)
  return core !== undefined && TEST_ORGANISATIONSNUMMER.has(core)
}

function normalizePhone(value) {
  const digits = value.replace(/\D/g, "")
  if (!value.trim().startsWith("+46")) return digits
  const afterCountry = digits.slice(2)
  return afterCountry.startsWith("0") ? afterCountry : `0${afterCountry}`
}

function approvedPhone(value) {
  const phone = normalizePhone(value)
  return FICTIONAL_PHONE_RANGES.some(
    ([start, end]) => phone.length === start.length && phone >= start && phone <= end,
  )
}

function approvedEmail(value) {
  const lower = value.toLowerCase()
  if (OPERATIONAL_EMAILS.has(lower)) return true
  const domain = lower.slice(lower.lastIndexOf("@") + 1)
  return (
    domain === "example.com" ||
    domain === "example.org" ||
    domain === "example.net" ||
    domain.endsWith(".example.com") ||
    domain.endsWith(".example.org") ||
    domain.endsWith(".example.net") ||
    domain === "test" ||
    domain.endsWith(".test")
  )
}

function approvedIp(value) {
  const [a, b, c] = value.split(".").map(Number)
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
}

const issues = []

function report(file, text, index, kind, value) {
  const line = text.slice(0, index).split("\n").length
  issues.push({ file, line, kind, value })
}

for (const file of repoFiles) {
  if (SKIP_FILES.has(file) || SKIP_PREFIXES.some((prefix) => file.startsWith(prefix))) continue
  // `git ls-files --cached` also lists tracked files deleted from the working
  // tree (e.g. a consumed .changeset entry before its deletion is committed).
  let stat
  try {
    stat = statSync(file)
  } catch {
    continue
  }
  if (stat.size > 20_000_000) continue

  const buffer = readFileSync(file)
  if (buffer.includes(0)) continue
  const text = buffer.toString("utf8")

  const identityPattern = /\b(?:(?:19|20)\d{6}[-+]?\d{4}|\d{6}[-+]?\d{4}|16\d{10})\b/g
  const identityMatches = [...text.matchAll(identityPattern)]
  const ibanPattern = /\bSE\d{2}(?:\s?\d){20}\b/gi
  const ibanMatches = [...text.matchAll(ibanPattern)]
  const cardPattern = /\b\d(?:[ -]?\d){12,18}\b/g
  const cardMatches = [...text.matchAll(cardPattern)]
  const bankgiroPattern = /\b\d{3,4}-\d{4}\b/g
  const bankgiroMatches = [...text.matchAll(bankgiroPattern)]
  const protectedSpans = [
    ...identityMatches.map((match) => [match.index, match.index + match[0].length]),
    ...ibanMatches.map((match) => [match.index, match.index + match[0].length]),
    ...cardMatches.map((match) => [match.index, match.index + match[0].length]),
    ...bankgiroMatches.map((match) => [match.index, match.index + match[0].length]),
  ]

  for (const match of identityMatches) {
    const value = match[0]
    const kind = dateKind(value) ?? (organisationCore(value) ? "organisationsnummer" : undefined)
    if (kind && !approvedIdentity(value, kind)) report(file, text, match.index, kind, value)
  }

  const phoneSpans = []
  if (!file.endsWith(".css")) {
    const phonePattern =
      /(?:^|[^\d])((?:\+46[\s-]?(?:\(0\)[\s-]?)?|0)(?:7[02369]|[1-9]\d?)(?:[\s-]?\d){6,8})\b/g
    for (const match of text.matchAll(phonePattern)) {
      const value = match[1]
      const start = match.index + match[0].indexOf(value)
      const end = start + value.length
      phoneSpans.push([start, end])
      if (
        protectedSpans.some(
          ([protectedStart, protectedEnd]) => protectedStart < end && protectedEnd > start,
        )
      ) {
        continue
      }
      const digits = value.replace(/\D/g, "")
      if (!approvedPhone(value) && !TEST_BANKGIRO.has(digits)) {
        report(file, text, start, "phone", value)
      }
    }
  }

  const emailPattern = /[A-ZÅÄÖ0-9._%+-]+@[A-ZÅÄÖ0-9.-]+\.[A-Z]{2,}\b/gi
  for (const match of text.matchAll(emailPattern)) {
    if (match.index > 0 && text[match.index - 1] === "@") continue
    if (!approvedEmail(match[0])) report(file, text, match.index, "email", match[0])
  }

  for (const match of ibanMatches) {
    const normalized = match[0].replace(/\s/g, "").toUpperCase()
    if (!TEST_IBANS.has(normalized)) report(file, text, match.index, "IBAN", match[0])
  }

  for (const match of cardMatches) {
    const digits = match[0].replace(/\D/g, "")
    if (luhnValid(digits) && !TEST_CARDS.has(digits)) {
      report(file, text, match.index, "card number", match[0])
    }
  }

  for (const match of bankgiroMatches) {
    const end = match.index + match[0].length
    if (cardMatches.some((card) => card.index < end && card.index + card[0].length > match.index)) {
      continue
    }
    const digits = match[0].replace(/\D/g, "")
    if (luhnValid(digits) && !TEST_BANKGIRO.has(digits)) {
      report(file, text, match.index, "bankgiro", match[0])
    }
  }

  const lines = text.split("\n")
  let offset = 0
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (/plusgiro/i.test(line)) {
      const plusgiroPattern = /\b\d(?:\s?\d){1,6}-\d\b/g
      for (const match of line.matchAll(plusgiroPattern)) {
        const digits = match[0].replace(/\D/g, "")
        if (digits.length >= 3 && luhnValid(digits) && !TEST_PLUSGIRO.has(digits)) {
          report(file, text, offset + match.index, "plusgiro", match[0])
        }
      }
    }
    offset += line.length + 1
  }

  // Natural-language corpora contain dotted bibliography/section references.
  // They are not IP fixtures; source templates and product fixtures remain
  // covered by the IP rule.
  if (!file.startsWith("training/data")) {
    const ipPattern = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g
    for (const match of text.matchAll(ipPattern)) {
      if (!approvedIp(match[0])) report(file, text, match.index, "public IP address", match[0])
    }
  }

  if (requiresSyntheticStreet(file)) {
    const postnummerPattern = /\b[1-9]\d{2}\s\d{2}\b|\b[1-9]\d{4}\b(?=\s+[A-ZÅÄÖ])/g
    for (const match of text.matchAll(postnummerPattern)) {
      const end = match.index + match[0].length
      const overlapsStructuredValue = [...protectedSpans, ...phoneSpans].some(
        ([start, protectedEnd]) => start < end && protectedEnd > match.index,
      )
      if (overlapsStructuredValue) continue
      const digits = match[0].replace(/\s/g, "")
      if (!TEST_POSTNUMMER.has(digits)) {
        report(file, text, match.index, "postnummer", match[0])
      }
    }

    const addressPattern =
      /\b(?:[A-ZÅÄÖa-zåäö]+(?:gatan|vägen|gränd|torget|allén)|[A-ZÅÄÖa-zåäö]+\s+(?:gata|väg))\s+\d{1,3}[A-Da-d]?\b/giu
    for (const match of text.matchAll(addressPattern)) {
      const lower = match[0].toLowerCase()
      if (!SYNTHETIC_STREETS.some((street) => lower.startsWith(`${street} `))) {
        report(file, text, match.index, "street address", match[0])
      }
    }
  }
}

if (issues.length > 0) {
  console.error("Potentially real identifiers found in repository fixtures:\n")
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line}  ${issue.kind}: ${issue.value}`)
  }
  console.error(
    "\nUse an owner-published test/documentation value and add it to scripts/check-fixture-identifiers.mjs with its source.",
  )
  process.exit(1)
}

console.log("fixture identifiers: source-backed test values only")
