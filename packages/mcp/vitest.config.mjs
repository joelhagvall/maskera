import { defineConfig } from "vitest/config"

// The audit runner's own tests (audit/*.test.mjs) use node:test and run in
// `pnpm check:tooling`; vitest owns only the unit tests under test/.
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } })
