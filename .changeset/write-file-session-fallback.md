---
"@maskera/mcp": patch
---

`maskera_write_file` no longer fails when the agent omits `session_id`. It now uses the latest session that knows every placeholder in the text, and refuses with the candidate session ids when several sessions would restore the text differently, so a missing id can never write another document's values.
