---
"maskera": minor
---

Group unambiguous surface variants of the same person under one placeholder ID (keeping Swedish genitive `-s` outside the placeholder as `[NAMN_1]s`), propagate `<FirstName> <LastInitial>` and case-insensitive full-name aliases within the same document, widen unlabeled ADR spans over Swedish cadastral `:unit` suffixes, and drop sentence-initial possessive `"Hans <noun>"` when no person named Hans appears in the document.
