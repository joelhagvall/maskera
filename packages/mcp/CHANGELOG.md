# @maskera/mcp

## 0.4.0

### Minor Changes

- Add automatic zero-PII setup receipts (`maskera-setup-receipt/v1`) to `install` and `doctor` (including a live Streamable HTTP `/mcp` probe and `--receipt <file.json>`), a single-command `wrap` launcher (`maskera-mcp wrap -- <cmd>`), client auto-detection plus `--apply`, `--project`, and `--with-hook` in `install`, a one-click self-test and copyable test prompt in `/_maskera` (`POST /_maskera/self-test`, `--open`), a local background `service` manager (`launchd` on macOS, `systemd --user` on Linux), clear first-run ONNX model loading status, and a warm loopback fast path (`POST /_maskera/guard`) for `maskera-mcp guard`.

## 0.3.0

### Minor Changes

- e901634: Add Streamable HTTP `/mcp` transport on the warm local proxy process, scoped connection policies (`--no-raw-restore`, `--read-only`, `--approval-mode automatic|browser|native` and `/mcp` query parameters), browser approvals in the local inspector with `maskera_resume`, redacted file listing and search tools (`maskera_list_files`, `maskera_search_files`), `outputSchema` on all tools, built-in MCP `prompts` and `resources` (`maskera://skills/maskera/SKILL.md`), and the `install` and `doctor` CLI subcommands.
