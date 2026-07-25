---
"@maskera/core": minor
"maskera": minor
---

Security hardening of the redaction core and the NER wrapper.

- `personnummer` and `samordningsnummer` now also match the space-separated
  form ("900101 2385", "19900101 2385"). A space where the dash goes was a
  one-character bypass of the most sensitive identifier in the set. The space
  is only accepted where the identifier's own separator sits, four digits from
  the end, so two unrelated numbers in a table never fuse into a candidate;
  detections on the eval corpora are unchanged.
- `regexDetector` reports the capture group's real position via match indices.
  It previously looked the group text up inside the whole match, which points
  at the wrong place whenever that text also occurs earlier in the match, so a
  custom detector could mask the wrong slice and leave the value in the clear.
- `redact()` and `restore()` no longer cost O(values x text). The placeholder
  collision check is answered per label instead of per value, and `restore()`
  is a single pass over the tokens; 4k distinct values in a 150 KB document
  went from 237 ms to a few ms.
- `restore()` no longer substitutes inside a value it just inserted, so a value
  that contains another placeholder token survives the round trip.
- `redactFromDetections()` rejects malformed spans instead of silently
  duplicating text, and a crafted input seeded with placeholder-shaped strings
  no longer makes redaction throw.
- `createNerRecognizer()` rejects a `minScore` that is not a finite number in
  [0, 1]. `NaN` silently dropped every model detection, which is fail-open.
- `defaultLabelMap` constrains an unknown model group to a placeholder-safe
  character set, so a third-party model cannot smuggle bracket syntax into the
  redacted text.
- The whitespace skipped between two pieces of one entity is bounded, which
  also removes a slow path on text extracted from PDFs.
