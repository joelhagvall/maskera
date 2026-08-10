#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { contractPath, repoRoot } from "./benchmark-contract.mjs"

const copies = [
  [contractPath, resolve(repoRoot, "apps/demo/public/benchmark-release.json")],
  [
    resolve(repoRoot, "docs/benchmark-release.schema.json"),
    resolve(repoRoot, "apps/demo/public/benchmark-release.schema.json"),
  ],
]

for (const [source, destination] of copies) {
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(source, destination)
  console.log(`synced ${destination.replace(`${repoRoot}/`, "")}`)
}
