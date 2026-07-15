# Safe test data

Fixtures, examples, screenshots and demo scripts must never contain real personal data or
plausible-but-unverified account identifiers. A value being invented, checksum-valid or absent
from a public lookup is not enough: positive structured-identifier fixtures must be explicitly
published for testing or fictional use by the responsible authority.

## Approved sources

- Personnummer and samordningsnummer: [Skatteverket's open test-person datasets](https://www.skatteverket.se/omoss/digitalasamarbeten/omvaraoppnadata/testpersonnummersomoppendata.4.5b35a6251761e6914202df9.html).
- Organisationsnummer: the `Kommun A` test certificate in [Skatteverket's Navet test documentation](https://www.skatteverket.se/download/18.262c54c219391f2e9638/1733323191133/Navet-Teknisk-handledning-Test-Folkbokforingsuppgifter-for-offentliga-aktorer-SOAP.pdf).
- Swedish phone numbers: [PTS ranges reserved for books and films](https://pts.se/internet-och-telefoni/telefonnummer-och-adressering/telefonnummer-till-bocker-och-filmer/).
- Postnummer: PostNord's published addressing example `123 45 Staden` in its [postage guide](https://www.postnord.se/siteassets/pdf/ovrigt/portoguide-1-januari-2024.pdf).
- Bankgiro: Bankgirot's [Bankgiro Link test files](https://www.bankgirot.se/kundservice/exempelfiler/), which state that their bankgiro and account numbers are test data, not authentic accounts.
- PlusGiro: Nordea's [Total IN example files](https://www.nordea.se/foretag/produkter/betala/total-in-bas.html).
- Swedish IBAN: [Swedbank Validex test accounts](https://www.swedbank.se/foretag/betala-och-ta-betalt/betala/fakturahantering/betala-via-fil/mig.html).
- Card numbers: [Stripe's published test cards](https://docs.stripe.com/testing).
- Email and web hosts: [IANA-reserved example domains](https://www.iana.org/help/example-domains) or the reserved `.test` top-level domain.
- IP addresses: [IANA documentation networks](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`, or private/loopback ranges when the test specifically requires them.

User-facing address examples use conspicuously fictional `Påhitt-` or `Maskera-` street names.
Natural-language training and evaluation corpora may use public names, organisations and place
vocabulary as model-quality probes, but must be synthetically composed and must never be sourced
from private records. Never combine a real person's identity with a real identifier, contact route
or residential address.

Deliberately invalid negative-test values are allowed when the test proves rejection; they must
fail the applicable structural or checksum validation and therefore cannot be valid identifiers.
Real operational contact details require a narrow, documented allowlist entry.

## Enforcement

Run `pnpm check:fixtures`. It is also part of both `pnpm test` and `pnpm lint`.

The check rejects unknown valid personnummer, samordningsnummer, organisationsnummer, Swedish
phone and postnummer examples, emails, IBANs, card numbers, Bankgiro/PlusGiro values, public IP
addresses and non-fictional street addresses in user-facing/unit-test fixtures. When adding a
positive fixture, add its authoritative source beside the allowlist in
`scripts/check-fixture-identifiers.mjs`.
