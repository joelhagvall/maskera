#!/usr/bin/env node

// The root-level eval command promises to grade the published model. Keep the
// package runner configurable for local model development, but make the root
// command select the Hub artifact explicitly and portably across shells.
process.env.MASKERA_REMOTE = "1"

await import("../packages/ner/eval/run-eval.mjs")
