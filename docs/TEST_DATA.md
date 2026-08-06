# Safe test data

Fixtures, examples, screenshots and demo scripts must never contain real personal data or
plausible-but-unverified account identifiers. A value being invented, checksum-valid or absent
from a public lookup is not enough: positive structured-identifier fixtures must be explicitly
published for testing or fictional use by the responsible authority.

## Approved sources

- Personnummer and samordningsnummer: [Skatteverket's open test-person datasets](https://www.skatteverket.se/omoss/digitalasamarbeten/omvaraoppnadata/testpersonnummersomoppendata.4.5b35a6251761e6914202df9.html).
- Organisationsnummer: the `Kommun A` test certificate in [Skatteverket's Navet test documentation](https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-folkbokforingsuppgifter-for-offentliga-aktorer-v3/pdf/1.0.3/tjanstebeskrivning-folkbokforingsuppgift-offentliga-aktorer-v3.pdf).
- Swedish phone numbers: [PTS ranges reserved for books and films](https://pts.se/internet-och-telefoni/telefonnummer-och-adressering/telefonnummer-till-bocker-och-filmer/).
- Postnummer: PostNord's published addressing example `123 45 Staden` in its [addressing guide](https://www.postnord.se/siteassets/-pdf/ovrigt/skicka-ratt-med-postnord-20260126.pdf).
- Bankgiro: Bankgirot's [Bankgiro Link test files](https://www.bankgirot.se/kundservice/exempelfiler/), which state that their bankgiro and account numbers are test data, not authentic accounts.
- PlusGiro: Nordea's [Total IN example files](https://www.nordea.se/foretag/produkter/betala/total-in-bas.html).
- Swedish IBAN: [Swedbank Validex test accounts](https://www.swedbank.se/foretag/betala-och-ta-betalt/betala/fakturahantering/betala-via-fil/mig.html).
- Card numbers: [Stripe's published test cards](https://docs.stripe.com/testing).
- Email and web hosts: [IANA-reserved example domains](https://www.iana.org/help/example-domains) or the reserved `.test` top-level domain.
- IP addresses: [IANA documentation networks](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) `192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`, or private/loopback ranges when the test specifically requires them.

User-facing and annotated task-evaluation addresses use conspicuous synthetic markers such as
`Påhitt-`, `Maskera-`, `Provdata-`, `Fiktiv-`, `Syntet-` or `Testkorpus-`; an ordinary-looking
street/number pair is rejected even when it was randomly composed.
Case, customer, journal, order and property references must begin with an
explicit `TEST-`, `PROV-`, `FIKTIV-`, `EXEMPEL-` or `SYNTET-` marker; a
plausible numeric reference is not acceptable merely because it was invented.
Task-training rows may use public names, organisations and place vocabulary as class exemplars,
but must be synthetically composed and must never be sourced from records. The privacy-clean
release runner uses synthetic evaluation and non-record category probes. Optional external prose
evaluation is a separate, aggregate-only measurement; raw downloads are deleted immediately and
never become a release dependency. Never combine a real person's identity with a real identifier,
contact route, record reference or residential address.

Deliberately invalid negative-test values are allowed when the test proves rejection; they must
fail the applicable structural or checksum validation and therefore cannot be valid identifiers.
Real operational contact details require a narrow, documented allowlist entry.

## Enforcement

Run `pnpm check:fixtures`. It is also part of both `pnpm test` and `pnpm lint`.

The check rejects unknown valid personnummer, samordningsnummer, organisationsnummer, Swedish
phone and postnummer examples, emails, IBANs, card numbers, Bankgiro/PlusGiro values, public IP
addresses, unmarked record references and non-fictional street addresses
throughout the tracked repository and any unignored new text files. When
adding a positive fixture, add its authoritative source beside the allowlist
in `scripts/check-fixture-identifiers.mjs`.
