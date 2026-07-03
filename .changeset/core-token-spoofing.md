---
"@maskera/core": patch
---

Never hand out a placeholder token that already occurs literally in the input. Previously a crafted input containing e.g. `[NAMN_1]` could collide with a generated placeholder, letting `restore()` write the real value into positions chosen by the author of the input text.
