---
"@maskera/core": patch
---

Broaden personnummer and samordningsnummer detection to mask date-shaped values even when the Luhn control digit is mistyped, and recognize international phone numbers with an explicit country-code prefix. Prefer the phone label when a Swedish phone and samordningsnummer shape overlap. Preserve the strict checksum validators as public APIs.
