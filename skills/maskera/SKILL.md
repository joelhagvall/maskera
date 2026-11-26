---
name: maskera
description: Redact Swedish personal data (names, personnummer, addresses, phones, emails, IBAN, org numbers) locally before text or files reach an AI model, and restore answers locally. Use when working with Swedish client files, HR/CVs, legal or municipal cases, healthcare notes, support transcripts, or when setting up @maskera/mcp (local LLM proxy, MCP server, guard) or the maskera npm SDK.
---

# Maskera: local Swedish PII redaction

Maskera runs 100% locally on-device using deterministic Swedish rules plus the 43 MB Swedish ONNX NER model (`joelhagvall/maskera-sv-ner`). Raw PII and restore maps stay local so cloud LLMs only see placeholders such as `[NAMN_1]` and `[PERSONNUMMER_1]`.

## Choose the right mode

1. **Enforced redaction across any agent harness (local LLM proxy):**
   Use when no prompt, history or tool output may leave the machine unredacted.
   ```bash
   npx -y @maskera/mcp proxy
   # Point any harness or SDK at the loopback proxy:
   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude
   OPENAI_BASE_URL=http://127.0.0.1:8787/v1 codex
   ```
   - Routes Anthropic (`/v1/messages`) and OpenAI (`/v1/chat/completions`, `/v1/responses`) automatically, or set `--upstream <url>`.
   - Restores placeholders transparently in JSON, tool arguments and chunk-split SSE streams.
   - Fails closed (`502`) if local redaction fails. Inspect counts only at `http://127.0.0.1:8787/_maskera/status`.

2. **Working with sensitive local Swedish files (MCP stdio server):**
   Configure once in the client's `mcpServers`:
   ```json
   {
     "mcpServers": {
       "maskera": {
         "command": "npx",
         "args": ["-y", "@maskera/mcp", "--root", "/path/to/workspace"]
       }
     }
   }
   ```
   Workflow rules when the Maskera MCP tools are available:
   - Read sensitive Swedish files with `maskera_read_file` instead of raw file-reading tools. Reuse one `session_id` across related files so `[NAMN_1]` stays consistent.
   - Pass `custom_terms` for client codenames, project names or case references not covered by built-in rules.
   - Pass `profile: "clinical"` for Swedish medical or care notes so diagnoses, doses and measurements stay intact while personal data is masked.
   - Write finished drafts directly to disk with `maskera_write_file` so placeholders are restored locally without echoing raw PII back into the conversation.
   - Leave `include_map` unset (`false`) on `maskera_redact` unless the caller explicitly asks for the raw map.
   - Clear the in-memory restore map with `maskera_clear_session` once the task is done.

3. **Hooks and Unix pipes (guard):**
   ```bash
   # Block prompts or JSON hook payloads containing PII (exits 2, prints counts only):
   npx -y @maskera/mcp guard
   # Redact text locally in a pipeline:
   cat input.txt | npx -y @maskera/mcp guard --redact
   ```

4. **Embedding in application code (browser or Node 18+):**
   ```bash
   npm install maskera @huggingface/transformers
   ```
   Reuse one `createNerRecognizer()` instance across calls and run `await redactWithNer(text, { recognizer })` (or `redact(text)` from `@maskera/core` for zero-dependency structured rules only).

## Boundaries

- A skill guides agent behaviour; for hard enforcement that cannot be bypassed by raw shell or file tools, use `maskera-mcp proxy` or restrict file access to `maskera-mcp` only.
- Automated masking reduces exposure risk but is not a zero-leak guarantee. Never log restore maps or write them next to redacted outputs.
- Reference docs and machine-readable details: `https://maskera.dev/llms.txt`.
