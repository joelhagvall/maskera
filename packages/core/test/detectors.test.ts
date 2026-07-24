import { describe, expect, it } from "vitest"
import {
  adress,
  bankgiro,
  creditCard,
  defaultDetectors,
  email,
  heuristicDetectors,
  iban,
  ipAddress,
  lagenhetsnummer,
  organisationsnummer,
  personnummer,
  phone,
  plusgiro,
  postnummer,
  regnummer,
  samordningsnummer,
  url,
} from "../src/detectors"
import type { Detector } from "../src/types"

/**
 * Table-driven detector tests. Each detector gets a batch of inputs that MUST
 * match and a batch of adversarial inputs that MUST NOT, the negatives are
 * where redactors actually break (a year mistaken for a phone number, a
 * reference id mistaken for a personnummer). We bias hard toward negatives.
 *
 * `hit` checks that the detector finds `value` somewhere in `input`; `miss`
 * checks it finds nothing. A detector may legitimately find *other* spans in a
 * positive string, so we assert on the presence of the expected value, not the
 * total count.
 */
function expectHit(detector: Detector, input: string, value: string) {
  const found = detector.detect(input).map((m) => m.value)
  expect(found, `${detector.label} should find "${value}" in "${input}"`).toContain(value)
}

function expectMiss(detector: Detector, input: string) {
  const found = detector.detect(input)
  expect(found, `${detector.label} should find nothing in "${input}"`).toHaveLength(0)
}

// --- Personnummer ---------------------------------------------------------

describe("personnummer detector", () => {
  // 900101-2385 is a Luhn-valid synthetic identifier.
  it.each([
    "19900101-2385",
    "900101-2385",
    "199001012385",
    "9001012385",
    "900101+2385", // 100+ years old uses '+'
  ])("matches valid form: %s", (s) => expectHit(personnummer, `Patient ${s} skrevs in.`, s))

  it.each([
    ["bad Luhn", "900101-0018"],
    ["impossible month", "901301-0017"],
    ["impossible day", "900132-0017"],
    ["plain reference id", "123456-0000"],
    ["order number", "Order 100200-3000 levererad"],
    ["just a year range", "2019-2024"],
  ])("rejects %s: %s", (_label, s) => expectMiss(personnummer, s))
})

describe("samordningsnummer detector", () => {
  // Samordningsnummer = personnummer with day + 60. 700178-2395 is day 78 (==18),
  // 640372-2397 is day 72 (==12). Both are official Skatteverket test numbers.
  it.each(["700178-2395", "640372-2397"])("matches a valid samordningsnummer: %s", (s) =>
    expectHit(samordningsnummer, `Klienten ${s} registrerades.`, s))

  it("does not match an ordinary personnummer (day < 60)", () => {
    expectMiss(samordningsnummer, "900101-2385")
  })
})

describe("organisationsnummer detector", () => {
  it("matches a Luhn-valid orgnr with third digit >= 2", () => {
    expectHit(organisationsnummer, "Kommun A 202100-4748 är registrerad.", "202100-4748")
  })

  it.each([
    ["bad Luhn", "556036-0794"],
    ["third digit < 2 (looks like personnummer)", "551036-0793"],
  ])("rejects %s", (_label, s) => expectMiss(organisationsnummer, s))
})

// --- Email ----------------------------------------------------------------

describe("email detector", () => {
  it.each([
    "anna@example.com",
    "anna.berg@sub.example.com",
    "a+tag@sub.example.org",
    "ANNA@EXAMPLE.COM",
    "user_name99@example.net",
    "åsa.öberg@example.com",
    "håkan@example.org",
  ])("matches: %s", (s) => expectHit(email, `Maila ${s} idag.`, s))

  it("matches an åäö address at the start of the text", () => {
    expectHit(email, "åsa.öberg@example.com är rätt adress", "åsa.öberg@example.com")
  })

  it.each([
    ["no TLD", "anna@localhost"],
    ["no @", "anna.example.com"],
    ["bare domain", "example.com"],
  ])("rejects %s: %s", (_label, s) => expectMiss(email, s))

  // The pattern is bounded to RFC 5321 maxima so it cannot backtrack
  // quadratically (see the detector's comment). These pin the boundary so a
  // future "let's simplify the regex" doesn't quietly reintroduce the blowup.
  it("matches a local part at the 64-character maximum", () => {
    expectHit(email, `x ${"a".repeat(64)}@example.com`, `${"a".repeat(64)}@example.com`)
  })

  it("still finds the address when the local part exceeds 64 characters", () => {
    // The match window slides rather than failing: the trailing 64 characters
    // are what gets masked, so the domain and most of the local part are still
    // redacted. An over-long local part is not a real address anyway.
    const found = email.detect(`${"a".repeat(70)}@example.com`).map((m) => m.value)
    expect(found).toEqual([`${"a".repeat(64)}@example.com`])
  })

  it("does not backtrack quadratically on a long unbroken run", () => {
    // Every character here is in the local-part class, and there is no "@" at
    // all: the shape that made the unbounded pattern take ~57 s at 250 KB.
    // A base64url blob or a hex digest in a paste is exactly this shape.
    const hostile = "a1._%+-".repeat(40_000) // ~280 KB
    const started = performance.now()
    expect(email.detect(hostile)).toHaveLength(0)
    // Bounded runs in tens of milliseconds; the threshold is deliberately
    // loose so a slow CI runner cannot flake it, while still being ~3 orders
    // of magnitude below the unbounded pattern.
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it("does not backtrack quadratically on a long run that ends in an address", () => {
    const hostile = `${"a".repeat(200_000)} kontakt@example.com`
    const started = performance.now()
    expectHit(email, hostile, "kontakt@example.com")
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

// --- Phone ----------------------------------------------------------------

describe("phone detector", () => {
  it.each([
    "070-174 06 58",
    "0701740658",
    "+46 70 174 06 58",
    "+46701740658",
    "08-465 004 12",
    "031-390 06 12",
    // e-mail-signature style: trunk zero in parentheses after country code
    "+46(0)70-1740658",
    "+46 (0)70-174 06 58",
    "+46(0)8-465 004 12",
  ])("matches: %s", (s) => expectHit(phone, `Ring ${s} imorgon.`, s))

  it("matches at the very start of the text", () => {
    expectHit(phone, "0701740658 är mitt nummer", "0701740658")
  })

  it.each([
    ["a year", "år 1995"],
    ["a year range", "perioden 2019 2024"],
    ["short number", "rum 123"],
    ["inside a longer digit run", "kundnummer 100200-3000"],
  ])("rejects %s: %s", (_label, s) => expectMiss(phone, s))
})

// --- Postnummer -----------------------------------------------------------

describe("postnummer detector", () => {
  it.each(["123 45", "12345"])("matches PostNord's published example: %s", (s) =>
    expectHit(postnummer, `Adress ${s} Stockholm.`, s))

  it("matches the spaced form standing alone", () => {
    expectHit(postnummer, "postnumret är 123 45 enligt testet", "123 45")
  })

  it("matches the compact form before a capitalized city", () => {
    expectHit(postnummer, "skicka till 12345 Staden enligt exemplet", "12345")
  })

  it("matches with an SE- prefix", () => {
    expectHit(postnummer, "skicka till SE-123 45 tack", "123 45")
  })

  it("rejects a 6-digit run that isn't a postnummer shape", () => {
    expectMiss(postnummer, "kod 1234567 fel")
  })

  it.each([
    ["bare case number", "Ärende 48213: hanteras separat"],
    ["bare price", "priset är 12500 kr totalt"],
    ["order id at end of sentence", "din order 84120 skickades."],
    ["leading zero", "kod 01234 Stockholm"],
  ])("rejects %s: %s", (_label, s) => expectMiss(postnummer, s))
})

// --- Payment identifiers --------------------------------------------------

describe("bankgiro detector", () => {
  // Bankgirot publishes 991-2346 in its test files; the padded form exercises
  // the detector's eight-digit branch without introducing another account.
  it.each(["991-2346", "0991-2346"])("matches valid bankgiro: %s", (s) =>
    expectHit(bankgiro, `Betala till bankgiro ${s}.`, s))

  it.each([
    ["year range", "2019-2024"],
    ["arbitrary ref with bad checksum", "1234-5678"],
  ])("rejects %s (fails Luhn): %s", (_label, s) => expectMiss(bankgiro, s))
})

describe("plusgiro detector", () => {
  it("matches Nordea's published compact test account", () => {
    expectHit(plusgiro, "Plusgiro 920100-5 tack.", "920100-5")
  })

  it("matches the same test account with space grouping", () => {
    expectHit(plusgiro, "Betala till plusgiro 92 01 00-5 tack.", "92 01 00-5")
  })

  it.each([
    ["list numbering", "punkt 1-2"],
    ["ref with bad checksum", "12345-6"],
  ])("rejects %s (fails Luhn): %s", (_label, s) => expectMiss(plusgiro, s))

  // Luhn-valid by chance but a single-digit body: scores, page ranges and
  // list numbering ("3-4", "6-7") vastly outnumber one-digit plusgiro
  // accounts, so these must stay unmasked.
  it.each([
    ["list numbering", "punkt 3-4"],
    ["match score", "vann med 6-7"],
    ["single-digit body", "4-2"],
  ])("rejects %s despite valid Luhn: %s", (_label, s) => expectMiss(plusgiro, s))
})

describe("iban detector", () => {
  const IBAN = "SE42 8000 0890 1191 4616 8423"
  it("matches a spaced Swedish IBAN", () => expectHit(iban, `Konto ${IBAN} hos banken.`, IBAN))
  it("matches an unspaced Swedish IBAN", () =>
    expectHit(iban, "Konto SE4280000890119146168423.", "SE4280000890119146168423"))
  it("rejects a non-SE IBAN", () => expectMiss(iban, "DE89370400440532013000"))
})

describe("creditCard detector", () => {
  // Stripe publishes 4242 4242 4242 4242 for interactive testing.
  it.each([
    "4242 4242 4242 4242",
    "4242-4242-4242-4242",
    "4242424242424242",
  ])("matches valid Luhn card: %s", (s) => expectHit(creditCard, `Kort ${s} debiterat.`, s))

  it("rejects a card-shaped number that fails Luhn", () => {
    expectMiss(creditCard, "4242 4242 4242 4243")
  })
})

// --- Generic --------------------------------------------------------------

describe("ipAddress detector", () => {
  it.each(["192.0.2.1", "198.51.100.42", "203.0.113.255"])("matches: %s", (s) =>
    expectHit(ipAddress, `Från ${s} loggades in.`, s))

  it.each([
    ["out of range octet", "999.1.1.1"],
    ["version string", "v1.2.3.4 build"],
  ])("rejects %s: %s", (_label, s) => expectMiss(ipAddress, s))
})

describe("url detector", () => {
  it.each([
    "https://example.com",
    "http://example.org/a/b?c=1",
    "https://sub.example.com/path#frag",
    "www.example.org",
    "WWW.EXAMPLE.COM",
    "www.sub.example.net/en/path",
  ])("matches: %s", (s) => expectHit(url, `Se ${s} för mer.`, s))

  it("does not double-match the www inside a full URL", () =>
    expectHit(url, "Se https://www.example.com för mer.", "https://www.example.com"))

  it.each([
    ["comma", "Se https://example.com/sida, för mer.", "https://example.com/sida"],
    ["full stop", "Gå till www.example.org.", "www.example.org"],
    ["question mark", "Har du sett https://example.com/sida?", "https://example.com/sida"],
    ["ellipsis", "kolla www.example.com...", "www.example.com"],
    ["exclamation", "Besök https://example.com/rea!", "https://example.com/rea"],
  ])("leaves trailing sentence punctuation outside the value: %s", (_label, s, expected) =>
    expectHit(url, s, expected))

  it("still matches dots and query punctuation inside the path", () =>
    expectHit(
      url,
      "Se https://example.com/v1.2/api?a=1,b=2 nu.",
      "https://example.com/v1.2/api?a=1,b=2",
    ))

  it.each([
    ["bare domain without scheme or www", "besök example.com idag"],
    ["the word www on its own", "skriv www. och sen domänen"],
    ["www glued into a longer word", "protokollet heter wwwexample internt"],
  ])("rejects %s: %s", (_label, s) => expectMiss(url, s))
})

// --- Opt-in heuristics ------------------------------------------------------

describe("adress detector (heuristic)", () => {
  it.each([
    "Påhittsgatan 12B",
    "Maskeravägen 3",
    "Påhittsvägen 21",
    "Maskeratorget 2",
    "Norra Maskeragatan 101",
    "PÅHITTSGATAN 12",
    "påhittsvägen 21",
    "Maskeragränd 15",
  ])("matches: %s", (s) => expectHit(adress, `Bor på ${s} i stan.`, s))

  it.each([
    ["street with no house number", "vi sågs på Påhittsgatan igår"],
    ["lowercase non-name use", "en lång väg hem till nummer 12"],
  ])("rejects %s: %s", (_label, s) => expectMiss(adress, s))
})

describe("lagenhetsnummer detector (heuristic)", () => {
  it.each(["lgh 1203", "lägenhet 42", "Lgh 1203"])("matches: %s", (s) =>
    expectHit(lagenhetsnummer, `Nycklar till ${s} kvitterade.`, s))

  it("rejects the word without a number", () =>
    expectMiss(lagenhetsnummer, "en fin lägenhet i stan"))
})

describe("regnummer detector (heuristic)", () => {
  it.each(["ABC 123", "ABC123", "XYZ 12A"])("matches: %s", (s) =>
    expectHit(regnummer, `Bilen ${s} stod parkerad.`, s))

  it.each([
    ["currency amount", "priset är SEK 100 per styck"],
    ["currency amount", "kostar USD 500"],
    ["plate letters Sweden never issues", "IQV 123"],
    ["too many digits", "ABC 1234"],
  ])("rejects %s: %s", (_label, s) => expectMiss(regnummer, s))
})

describe("heuristicDetectors bundle", () => {
  it("contains exactly the three opt-in heuristics", () => {
    expect(heuristicDetectors.map((d) => d.label)).toEqual([
      "ADRESS",
      "LAGENHETSNUMMER",
      "REGNUMMER",
    ])
  })

  it("stays out of defaultDetectors", () => {
    const defaults = new Set(defaultDetectors.map((d) => d.label))
    for (const d of heuristicDetectors) expect(defaults.has(d.label)).toBe(false)
  })
})
