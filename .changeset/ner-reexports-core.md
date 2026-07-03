---
"@maskera/ner": minor
---

Re-export the entire `@maskera/core` API from `@maskera/ner`. One install and one import is now enough for the full setup: `redact`, `restore`, all detectors and validators are importable directly from `@maskera/ner`, and `@maskera/core` is pulled in automatically as a dependency. Installing `@maskera/core` on its own remains the zero-dependency, rules-only path.
