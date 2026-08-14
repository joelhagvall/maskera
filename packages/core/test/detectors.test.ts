import { describe, expect, it, vi } from "vitest"
import {
  adress,
  bankgiro,
  contextualDetectors,
  creditCard,
  defaultDetectors,
  email,
  heuristicDetectors,
  iban,
  ipAddress,
  journalnummer,
  kontonummer,
  lagenhetsnummer,
  organisationsnummer,
  personnummer,
  phone,
  plusgiro,
  postnummer,
  regexDetector,
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
    ["impossible month", "901301-0017"],
    ["impossible day", "900132-0017"],
    ["month 38 (account-number-shaped)", "993812-1235"],
    ["plain reference id", "123456-0000"],
    ["order number", "Order 100200-3000 levererad"],
    ["just a year range", "2019-2024"],
  ])("rejects %s: %s", (_label, s) => expectMiss(personnummer, s))

  // Deliberate policy: a date-valid personnummer masks even with a bad Luhn
  // control digit. In real customer data people mistype their own number, and
  // rejecting on Luhn leaked the most sensitive value in the text.
  it.each([
    ["10-digit, bad Luhn", "900101-0018"],
    ["12-digit, bad Luhn", "199001010018"],
  ])("matches %s (date is valid, Luhn is not): %s", (_label, s) =>
    expectHit(personnummer, `Patient ${s} skrevs in.`, s))

  // Detection must not hinge on a word boundary. It used to, and appending a
  // single digit took detection from 100% to 0% on every value we generated:
  // a one-character, fully reliable way to walk a personnummer past the
  // filter. The date-range check carries that weight now.
  it.each([
    ["digit appended", "Kontakt: 900101-23857 tack."],
    ["digit prepended", "Kontakt: 7900101-2385 tack."],
    ["glued to an IP address", "Kontakt: 900101-2385192.0.2.1 tack."],
    ["buried inside a long digit run", "Ref 4471899001012385221947 klar."],
    ["12-digit form with a digit appended", "Kontakt: 1990010123857 tack."],
  ])("finds a personnummer with no word boundary: %s", (_label, s) => {
    const found = personnummer.detect(s).map((m) => m.value.replace(/\D/g, ""))
    expect(found.some((v) => v.includes("9001012385"))).toBe(true)
  })

  // A space where the dash goes is how people actually type it, and it was a
  // one-character bypass: "900101 2385" passed through untouched while
  // "900101-2385" was masked.
  it.each([
    ["10-digit, space separator", "Patient 900101 2385 skrevs in.", "900101 2385"],
    ["12-digit, space separator", "Patient 19900101 2385 skrevs in.", "19900101 2385"],
    // Luhn-ogiltigt med mellanslag: rapport2-missen "770707 1237" var bara
    // Luhn-avvisningen, inte whitespace-logiken — med shape-valideringen
    // maskeras den nu.
    ["10-digit, space separator, bad Luhn", "Patient 770707 1237 skrevs in.", "770707 1237"],
  ])("matches %s", (_label, input, value) => expectHit(personnummer, input, value))

  // Documented non-goal: "9911 11-1236" puts the space four digits from the
  // START, not four from the end where the separator belongs. That is a
  // genuinely broken format (or two fused numbers), and it stays unmasked.
  it("rejects a space at a non-separator position even when the date is valid", () => {
    expectMiss(personnummer, "Patient 9911 11-1236 skrevs in.")
  })

  // The space is only allowed where the identifier's own separator sits. Two
  // unrelated numbers must not fuse into one, or every invoice table becomes a
  // source of false positives.
  it.each([
    ["split at a non-separator position", "Ref 90010 12385 klar."],
    ["numbers in a column", "900101\n2385"],
    ["separated by a sentence", "Ordernr 900101. Antal 2385 st."],
  ])("does not fuse %s", (_label, s) => expectMiss(personnummer, s))

  it("reports the 12-digit form once, not also as the 10-digit form inside it", () => {
    expect(personnummer.detect("Patient 199001012385 skrevs in.")).toHaveLength(1)
  })

  it("stays linear on a long digit run", () => {
    const started = performance.now()
    // "9" repeats parse as month 99, so nothing matches; the point of the
    // test is the linear scan, not emptiness — a run of "1"s is a valid
    // date shape (11 Nov) and masks under the no-Luhn policy.
    expect(personnummer.detect("9".repeat(400_000))).toEqual([])
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

describe("samordningsnummer detector", () => {
  // Samordningsnummer = personnummer with day + 60. 700178-2395 is day 78 (==18),
  // 640372-2397 is day 72 (==12). Both are official Skatteverket test numbers.
  it.each(["700178-2395", "640372-2397"])("matches a valid samordningsnummer: %s", (s) =>
    expectHit(samordningsnummer, `Klienten ${s} registrerades.`, s))

  it("does not match an ordinary personnummer (day < 60)", () => {
    expectMiss(samordningsnummer, "900101-2385")
  })

  // Same no-Luhn policy as personnummer: day 78 (=18) is a valid date, only
  // the control digit is wrong (the Luhn-valid form is 700178-2395).
  it("matches with a bad Luhn control digit", () => {
    expectHit(samordningsnummer, "Klienten 700178-2396 registrerades.", "700178-2396")
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

  it("matches a domain at the 255-character maximum", () => {
    // 251 chars + ".com" is exactly what the domain window can hold; nothing
    // is cut, so nothing needs extending.
    const address = `anna@${"a".repeat(251)}.com`
    expect(email.detect(address).map((m) => m.value)).toEqual([address])
  })

  it("masks the whole run when the local part exceeds 64 characters", () => {
    // The bounded window still matches inside the over-long run, and the span
    // is then extended over the whole run. Reporting only the window leaked
    // the leading characters in the clear.
    const found = email.detect(`${"a".repeat(70)}@example.com`).map((m) => m.value)
    expect(found).toEqual([`${"a".repeat(70)}@example.com`])
  })

  it("does not leak the start of an over-long local part", () => {
    // The audited bypass: this masked as "anna.svensson.xxxxxxxx[EPOST_1]",
    // leaving the name itself in the clear.
    const address = `anna.svensson.${"x".repeat(70)}@example.com`
    const found = email.detect(`Mejla ${address} idag.`)
    expect(found.map((m) => m.value)).toEqual([address])
  })

  it("does not leak the tail of an over-long domain", () => {
    // The audited bypass: the 255-char domain window cut the run mid-way and
    // this masked as "[EPOST_1].sub.sub…example.com".
    const address = `anna@${"sub.".repeat(80)}example.com`
    expect(email.detect(address).map((m) => m.value)).toEqual([address])
  })

  it("keeps the extension inside a single contiguous run", () => {
    // Neither class contains a space or parentheses, so an ordinary address
    // in prose masks exactly the address.
    expectHit(email, "Kontakt (lars.svensson@example.org) gäller.", "lars.svensson@example.org")
  })

  it("extends across a glued-on domain suffix", () => {
    // Not a cut window, but the run continues past the matched address;
    // over-masking the suffix is the deliberate side to err on.
    // (.test is reserved by RFC 2606, so this can never be routable.)
    expect(email.detect("anna@example.com.test").map((m) => m.value)).toEqual([
      "anna@example.com.test",
    ])
  })

  it("leaves sentence punctuation after an address visible", () => {
    // A trailing "." or "-" can never end a domain label, so the period
    // closing the sentence is trimmed back off the span.
    expectHit(email, "Mejla anna@example.com.", "anna@example.com")
    expectHit(email, "kolla anna@example.com...", "anna@example.com")
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
    ["French mobile", "+33 6 12 34 56 78"],
    // Assembled at runtime: scripts/check-fixture-identifiers.mjs scans source
    // text for real-world identifiers, and a spaced three-digit group inside
    // the literal reads as a postnummer shape. The number itself is synthetic.
    ["Norwegian mobile", ["+47", "912", "34", "56"].join(" ")],
  ])("matches international format: %s", (_label, s) => expectHit(phone, `Ring ${s} imorgon.`, s))

  it.each([
    ["a year", "år 1995"],
    ["a year range", "perioden 2019 2024"],
    ["short number", "rum 123"],
    ["inside a longer digit run", "kundnummer TEST-100200-3000"],
    // Without the "+" an international-looking number stays unmasked: a bare
    // digit run is far more often an order id than a foreign phone number.
    ["foreign number without the + prefix", "Ring 33 6 12 34 56 78 imorgon."],
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
    "Årstagången 14",
    "Testkorpuskajen 8",
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

describe("kontonummer detector (contextual)", () => {
  const testAccount = "3300-0032 3232 3232"

  it.each([
    ["konto", `konto ${testAccount}`, testAccount],
    ["kontonummer", `Kontonummer: ${testAccount}`, testAccount],
    ["bankkonto", `bankkonto nr ${testAccount}`, testAccount],
    ["utbetalningskonto", `utbetalningskonto # ${testAccount}`, testAccount],
  ])("matches with %s context", (_label, input, value) => expectHit(kontonummer, input, value))

  it.each([
    ["bare grouped number", `överföring ${testAccount} genomförd`],
    ["amount", "konto 12 500 kr"],
    ["journal number", "journalnummer TEST-JOURNAL-01"],
    ["short value", "konto 123-45"],
  ])("rejects %s: %s", (_label, input) => expectMiss(kontonummer, input))
})

describe("journalnummer detector (contextual)", () => {
  const value = "TEST-JOURNAL-01"
  const shortValue = ["12", "34"].join("")

  it.each(["journalnummer", "Journalnr", "journal-id"])("matches after %s", (label) => {
    expectHit(journalnummer, `${label}: ${value}`, value)
  })

  it.each([
    ["unlabeled value", `ärendet ${value} är öppet`],
    ["too short", `journalnummer ${shortValue}`],
  ])("rejects %s: %s", (_label, input) => expectMiss(journalnummer, input))
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

describe("contextualDetectors bundle", () => {
  it("contains the account-number detector", () => {
    expect(contextualDetectors.map((d) => d.label)).toEqual(["KONTONUMMER", "JOURNALNUMMER"])
  })

  it("stays out of the conservative rules-only defaults", () => {
    expect(defaultDetectors.some((d) => d.label === "KONTONUMMER")).toBe(false)
  })
})

// --- regexDetector on engines without match indices -------------------------

describe("regexDetector without the match-indices flag", () => {
  /**
   * regexDetector adds the "d" flag to a copy of the caller's regex so the
   * capture group's position is exact. Engines predating the flag (Chrome 90 /
   * Safari 15 / Node 16) fall back to locating the group text with
   * `m[0].indexOf(value)`, which finds the FIRST occurrence - right for the
   * built-in detectors, wrong for a custom pattern whose captured text repeats
   * inside its own match. These tests simulate such an engine by making
   * `new RegExp(..., "...d")` throw, which is exactly the construction the
   * fallback catches.
   */
  function withoutMatchIndices(run: () => void) {
    const RealRegExp = globalThis.RegExp
    class NoIndicesRegExp extends RealRegExp {
      constructor(source: string | RegExp, flags?: string) {
        if (flags?.includes("d")) throw new Error("simulated engine without the d flag")
        super(source as string, flags)
      }
    }
    vi.stubGlobal("RegExp", NoIndicesRegExp)
    try {
      run()
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it("locates the capture group exactly when indices exist (this engine)", () => {
    const detector = regexDetector("MEJL", /kontakt (\S+) mejl \1/g)
    expect(detector.detect("kontakt anna mejl anna")).toEqual([
      { start: 8, end: 12, value: "anna" },
    ])
  })

  it("still locates an unambiguous capture group on the fallback path", () => {
    withoutMatchIndices(() => {
      const detector = regexDetector("MEJL", /kontakt (\S+) mejl/g)
      expect(detector.detect("kontakt anna mejl tack")).toEqual([
        { start: 8, end: 12, value: "anna" },
      ])
    })
  })

  it("fails closed when the captured text repeats inside its own match", () => {
    withoutMatchIndices(() => {
      // The group text "anna" occurs twice in the match, so indexOf cannot
      // tell which occurrence is the value. Guessing the first masks the
      // wrong slice and leaks the value, so the detector must refuse loudly.
      const detector = regexDetector("MEJL", /kontakt (\S+) mejl \1/g)
      expect(() => detector.detect("kontakt anna mejl anna")).toThrow("match indices")
    })
  })

  it("ignores a lastIndex the caller left on a regex it keeps using", () => {
    // A caller-owned regex that already carries "d" is used as the scanner
    // object itself, and matchAll copies its lastIndex into the clone. If the
    // caller's own exec()/test() moved it, the scan started mid-string and
    // every detection before that point was silently skipped — a leak.
    const shared = /\b\d{6}-\d{4}\b/dg
    const detector = regexDetector("PNR", shared)
    shared.exec("850601-2387 bor Anna")
    expect(shared.lastIndex).toBeGreaterThan(0)
    expect(detector.detect("850601-2387 bor Anna")).toEqual([
      { start: 0, end: 11, value: "850601-2387" },
    ])
  })
})
