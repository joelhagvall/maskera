import { describe, expect, it } from "vitest"
import {
  url,
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
  // Samordningsnummer = personnummer with day + 60. 701063-2391 is day 63 (==03),
  // Luhn-valid synthetic. 640883-3231 is day 83 (==23).
  it.each(["701063-2391", "640883-3231"])("matches a valid samordningsnummer: %s", (s) =>
    expectHit(samordningsnummer, `Klienten ${s} registrerades.`, s),
  )

  it("does not match an ordinary personnummer (day < 60)", () => {
    expectMiss(samordningsnummer, "900101-2385")
  })
})

describe("organisationsnummer detector", () => {
  it("matches a Luhn-valid orgnr with third digit >= 2", () => {
    expectHit(organisationsnummer, "Bolaget 556036-0793 är registrerat.", "556036-0793")
  })

  it.each([
    ["bad Luhn", "556036-0794"],
    ["third digit < 2 (looks like personnummer)", "551036-0793"],
  ])("rejects %s", (_label, s) => expectMiss(organisationsnummer, s))
})

// --- Email ----------------------------------------------------------------

describe("email detector", () => {
  it.each([
    "anna@example.se",
    "anna.berg@example.co.uk",
    "a+tag@sub.domain.io",
    "ANNA@EXAMPLE.SE",
    "user_name99@x-y.com",
    "åsa.öberg@example.se",
    "håkan@sjöberg.se",
  ])("matches: %s", (s) => expectHit(email, `Maila ${s} idag.`, s))

  it("matches an åäö address at the start of the text", () => {
    expectHit(email, "åsa.öberg@example.se är rätt adress", "åsa.öberg@example.se")
  })

  it.each([
    ["no TLD", "anna@localhost"],
    ["no @", "anna.example.se"],
    ["bare domain", "example.se"],
  ])("rejects %s: %s", (_label, s) => expectMiss(email, s))
})

// --- Phone ----------------------------------------------------------------

describe("phone detector", () => {
  it.each([
    "070-123 45 67",
    "0701234567",
    "+46 70 123 45 67",
    "+46701234567",
    "08-123 456 78",
    "031-12 34 56",
    // e-mail-signature style: trunk zero in parentheses after country code
    "+46(0)70-1234567",
    "+46 (0)70-123 45 67",
    "+46(0)8-123 456 78",
  ])("matches: %s", (s) => expectHit(phone, `Ring ${s} imorgon.`, s))

  it("matches at the very start of the text", () => {
    expectHit(phone, "0701234567 är mitt nummer", "0701234567")
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
  it.each(["123 45", "12345", "114 51"])("matches: %s", (s) =>
    expectHit(postnummer, `Adress ${s} Stockholm.`, s),
  )

  it("matches the spaced form standing alone", () => {
    expectHit(postnummer, "postnumret är 852 31 enligt registret", "852 31")
  })

  it("matches the compact form before a capitalized city", () => {
    expectHit(postnummer, "bor på 85231 Sundsvall numera", "85231")
  })

  it("matches with an SE- prefix", () => {
    expectHit(postnummer, "skicka till SE-114 55 tack", "114 55")
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
  // All Luhn-valid (real bankgiro carries a mod-10 check digit).
  it.each(["100-0009", "1000-0008", "5050-1055"])("matches valid bankgiro: %s", (s) =>
    expectHit(bankgiro, `Betala till bankgiro ${s}.`, s),
  )

  it.each([
    ["year range", "2019-2024"],
    ["arbitrary ref with bad checksum", "1234-5678"],
  ])("rejects %s (fails Luhn): %s", (_label, s) => expectMiss(bankgiro, s))
})

describe("plusgiro detector", () => {
  // All Luhn-valid (real plusgiro carries a mod-10 check digit).
  it.each(["12345-5", "42-2", "1234567-4"])("matches: %s", (s) =>
    expectHit(plusgiro, `Plusgiro ${s} tack.`, s),
  )

  it("matches a space-grouped plusgiro (Radiohjälpen)", () => {
    expectHit(plusgiro, "Swisha eller plusgiro 90 19 50-6 tack.", "90 19 50-6")
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
  const IBAN = "SE45 5000 0000 0583 9825 7466"
  it("matches a spaced Swedish IBAN", () => expectHit(iban, `Konto ${IBAN} hos banken.`, IBAN))
  it("matches an unspaced Swedish IBAN", () =>
    expectHit(iban, "Konto SE4550000000058398257466.", "SE4550000000058398257466"))
  it("rejects a non-SE IBAN", () => expectMiss(iban, "DE89370400440532013000"))
})

describe("creditCard detector", () => {
  // 4111 1111 1111 1111 is the canonical Luhn-valid Visa test number.
  it.each(["4111 1111 1111 1111", "4111-1111-1111-1111", "4111111111111111"])(
    "matches valid Luhn card: %s",
    (s) => expectHit(creditCard, `Kort ${s} debiterat.`, s),
  )

  it("rejects a card-shaped number that fails Luhn", () => {
    expectMiss(creditCard, "4111 1111 1111 1112")
  })
})

// --- Generic --------------------------------------------------------------

describe("ipAddress detector", () => {
  it.each(["192.168.0.1", "8.8.8.8", "255.255.255.0"])("matches: %s", (s) =>
    expectHit(ipAddress, `Från ${s} loggades in.`, s),
  )

  it.each([
    ["out of range octet", "999.1.1.1"],
    ["version string", "v1.2.3.4 build"],
  ])("rejects %s: %s", (_label, s) => expectMiss(ipAddress, s))
})

describe("url detector", () => {
  it.each([
    "https://example.se",
    "http://x.io/a/b?c=1",
    "https://sub.domain.com/path#frag",
    "www.nordiskhandel.se",
    "WWW.EXAMPLE.SE",
    "www.sub.domain.co.uk/en/path",
  ])("matches: %s", (s) => expectHit(url, `Se ${s} för mer.`, s))

  it("does not double-match the www inside a full URL", () =>
    expectHit(url, "Se https://www.example.se för mer.", "https://www.example.se"))

  it.each([
    ["comma", "Se https://example.se/sida, för mer.", "https://example.se/sida"],
    ["full stop", "Gå till www.nordiskhandel.se.", "www.nordiskhandel.se"],
    ["question mark", "Har du sett https://example.se/sida?", "https://example.se/sida"],
    ["ellipsis", "kolla www.example.se...", "www.example.se"],
    ["exclamation", "Besök https://example.se/rea!", "https://example.se/rea"],
  ])("leaves trailing sentence punctuation outside the value: %s", (_label, s, expected) =>
    expectHit(url, s, expected),
  )

  it("still matches dots and query punctuation inside the path", () =>
    expectHit(
      url,
      "Se https://example.se/v1.2/api?a=1,b=2 nu.",
      "https://example.se/v1.2/api?a=1,b=2",
    ))

  it.each([
    ["bare domain without scheme or www", "besök example.se idag"],
    ["the word www on its own", "skriv www. och sen domänen"],
    ["www glued into a longer word", "protokollet heter wwwexample internt"],
  ])("rejects %s: %s", (_label, s) => expectMiss(url, s))
})

// --- Opt-in heuristics ------------------------------------------------------

describe("adress detector (heuristic)", () => {
  it.each([
    "Sankt Eriksgatan 12B",
    "Storvägen 3",
    "Björkvägen 21",
    "Rådhustorget 2",
    "Norra Stationsgatan 101",
    "STORGATAN 12",
    "björkvägen 21",
    "Östgötagatan 15",
  ])("matches: %s", (s) => expectHit(adress, `Bor på ${s} i stan.`, s))

  it.each([
    ["street with no house number", "vi sågs på Storgatan igår"],
    ["lowercase non-name use", "en lång väg 12 hem"],
  ])("rejects %s: %s", (_label, s) => expectMiss(adress, s))
})

describe("lagenhetsnummer detector (heuristic)", () => {
  it.each(["lgh 1203", "lägenhet 42", "Lgh 1203"])("matches: %s", (s) =>
    expectHit(lagenhetsnummer, `Nycklar till ${s} kvitterade.`, s),
  )

  it("rejects the word without a number", () =>
    expectMiss(lagenhetsnummer, "en fin lägenhet i stan"))
})

describe("regnummer detector (heuristic)", () => {
  it.each(["ABC 123", "ABC123", "XYZ 12A"])("matches: %s", (s) =>
    expectHit(regnummer, `Bilen ${s} stod parkerad.`, s),
  )

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
