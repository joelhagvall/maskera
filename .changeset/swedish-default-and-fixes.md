---
"@maskera/ner": minor
"@maskera/core": patch
---

`@maskera/ner`: maskera's own Swedish model (`joelhagvall/maskera-sv-ner`,
MIT, 40 MB q4) is now the default. Span reconstruction is rebuilt piece by
piece, fixing silent drops of hyphenated names ("Karl-Gustav"), ampersand orgs
("H&M") and title-attached subwords ("dr Svensson").

`@maskera/core`: the plusgiro detector now tolerates space-grouped numbers
("90 19 50-6") and validates the mod-10 check digit, so partial matches no
longer leak and look-alikes no longer fire.
