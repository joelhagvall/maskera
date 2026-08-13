---
"@maskera/core": minor
---

Harden redaction against crafted input. The placeholder retry bound now uses the shortest token length per label, so a document seeded with hundreds of colliding placeholders can no longer force `redact()` to throw; the email detector extends its span across the full contiguous run when the local part or domain exceeds the RFC length caps, closing a bypass where the identifying part of an over-long address was left in clear text (over-masking a glued-on suffix is the deliberate trade-off); and the legacy no-`hasIndices` fallback now fails closed on an ambiguous group position instead of silently slicing the wrong occurrence. The README documents expected input sizes and chunking for multi-MB documents.
