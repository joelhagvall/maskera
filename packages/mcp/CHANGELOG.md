# @maskera/mcp

## 0.4.3

### Patch Changes

- Updated dependencies
  - maskera@0.12.0

## 0.4.2

### Patch Changes

- Harden MCP server and local LLM proxy security boundaries, add per-client proxy session isolation, PII filename redaction, `--block-binary`, English system-prompt over-masking protection, mixed-script Cyrillic homoglyph and Swedish hyphenated compound handling, Ollama `reasoning` restoration, and a permanent audit and release-gate pipeline:

  - Block `mode: "rules"` downgrades on `maskera_read_file` and `maskera_search_files` when running in hybrid `auto` mode, scrub known session secrets from search matches before truncating, and check `--no-raw-restore` before session lookups.
  - Canonicalize proxy paths, fail closed (`415`/`400`) on non-JSON content types and non-object JSON bodies, cover additional LLM endpoints (`/completions`, `/embeddings`, `/messages/batches`, `/responses/input_tokens`, `/responses/compact`, `/moderations`) and fields (`custom_tool_call.input`, `metadata`, `user`, `messages[].name`, `reasoning_content`, `reasoning`, `refusal`, `function_call.arguments`, Base64 text documents, numeric PII in JSON tool arguments), and restore `message.reasoning` / `delta.reasoning` for local Ollama reasoning models.
  - Partition `SessionVault` and `ApprovalBroker` strictly by owner (`proxy`, `mcp:<sessionId>`, `mcp:stateless`, `default`), return `404` on unknown/closed `Mcp-Session-Id`, wipe owner state on `DELETE /mcp`, and derive isolated per-client proxy sessions when `x-maskera-session` is omitted.
  - Enforce loopback-only proxy binding by default with socket `remoteAddress` checks, set `redirect: "manual"` with upstream origin verification, create restored files and audit logs with mode `0o600`, enforce a 16 MiB `guard` input ceiling, and redact numeric PII in `guard --redact`.
  - Add `--block-binary` (and default audit/inspector/header warnings) for uninspectable binary attachments, paragraph-aware English system-prompt filtering in `auto` mode, bidirectional owner-scoped PII filename redaction across file tools, and lossless mixed-script Cyrillic homoglyph and Swedish hyphenated compound detection.

## 0.4.1

### Patch Changes

- eb8bb14: `maskera_write_file` no longer fails when the agent omits `session_id`. It now uses the latest session that knows every placeholder in the text, and refuses with the candidate session ids when several sessions would restore the text differently, so a missing id can never write another document's values.
- Updated dependencies [53c7aa7]
  - maskera@0.11.2

## 0.4.0

### Minor Changes

- Add automatic zero-PII setup receipts (`maskera-setup-receipt/v1`) to `install` and `doctor` (including a live Streamable HTTP `/mcp` probe and `--receipt <file.json>`), a single-command `wrap` launcher (`maskera-mcp wrap -- <cmd>`), client auto-detection plus `--apply`, `--project`, and `--with-hook` in `install`, a one-click self-test and copyable test prompt in `/_maskera` (`POST /_maskera/self-test`, `--open`), a local background `service` manager (`launchd` on macOS, `systemd --user` on Linux), clear first-run ONNX model loading status, and a warm loopback fast path (`POST /_maskera/guard`) for `maskera-mcp guard`.

## 0.3.0

### Minor Changes

- e901634: Add Streamable HTTP `/mcp` transport on the warm local proxy process, scoped connection policies (`--no-raw-restore`, `--read-only`, `--approval-mode automatic|browser|native` and `/mcp` query parameters), browser approvals in the local inspector with `maskera_resume`, redacted file listing and search tools (`maskera_list_files`, `maskera_search_files`), `outputSchema` on all tools, built-in MCP `prompts` and `resources` (`maskera://skills/maskera/SKILL.md`), and the `install` and `doctor` CLI subcommands.
