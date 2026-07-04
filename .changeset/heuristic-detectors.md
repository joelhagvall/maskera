---
"@maskera/core": minor
"maskera": minor
---

New opt-in Swedish heuristic detectors: `adress` (street addresses like "Sankt Eriksgatan 12B"), `lagenhetsnummer` ("lgh 1203") and `regnummer` (registration plates, with currency amounts like "SEK 100" excluded). Exported individually and as the `heuristicDetectors` bundle. They are format-based with no checksum, so `defaultDetectors` is unchanged; enable them with `detectors: [...defaultDetectors, ...heuristicDetectors]`. Previously these lived only in the demo app.
