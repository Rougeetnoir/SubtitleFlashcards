#!/usr/bin/env node
import path from "node:path"
import process from "node:process"
import { mergeTooEasyFromFile } from "./lib/tooEasy.js"

async function main() {
  const [inputPath] = process.argv.slice(2)
  if (!inputPath) {
    console.error("Usage: npm run apply-too-easy -- <too-easy.json>")
    process.exit(1)
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath)
  const result = await mergeTooEasyFromFile(resolvedInput)
  if (result.skipped) {
    console.log("No words to merge.")
    return
  }
  console.log(
    `Merged ${result.added} new entries into excludedWords.json (total ${result.total}).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
