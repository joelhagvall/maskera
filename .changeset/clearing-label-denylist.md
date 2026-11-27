---
"maskera": patch
---

The NER layer no longer masks the label word "clearingnummer" (also "clearing", "clearingnr") as an address. When the model tags a denylisted label word and the widening step appends a number ("clearingnummer 8327"), the detection is narrowed to the number, so the label stays readable and digits the rule layer misses stay masked.
