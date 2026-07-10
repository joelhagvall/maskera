---
"maskera": patch
---

New v11 model weights on the Hub (real informal-register training round:
SUCX 3.0, MASSIVE sv-SE, SIC2) and smarter span reconstruction: ADR spans now
widen over a trailing house number ("Sveavägen 44", not just "Sveavägen") and
PER spans over a trailing possessive s. Address eval is now a clean sweep
(21/21 exact spans, 100% precision, 0 leaks), lowercase chat text leaks 4.3pp
less, and the previously known "fatima" lowercase miss is fixed. Measured
tables in docs/BENCHMARKS.md.
