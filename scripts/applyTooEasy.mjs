#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const exclusionPath = path.join(projectRoot, "data", "excludedWords.json")

async function main() {
  const [inputPath] = process.argv.slice(2)
  if (!inputPath) {
    console.error("Usage: npm run apply-too-easy -- <too-easy.json>")
    process.exit(1)
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath)
  const [existing, incoming] = await Promise.all([
    readJsonSafe(exclusionPath, []),
    readJsonSafe(resolvedInput, []),
  ])

  if (!Array.isArray(incoming) || incoming.length === 0) {
    console.log("No words to merge.")
    return
  }

  const merged = new Set(
    existing
      .filter((word) => typeof word === "string")
      .map((word) => normalizeWord(word))
      .filter(Boolean),
  )

  for (const word of incoming) {
    const normalized = normalizeWord(word)
    if (!normalized) continue
    merged.add(normalized)
  }

  const sorted = Array.from(merged).sort()
  await writeFile(exclusionPath, JSON.stringify(sorted, null, 2), "utf8")
  console.log(
    `Merged ${incoming.length} entries into excludedWords.json (total ${sorted.length}).`,
  )
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function normalizeWord(word) {
  if (!word || typeof word !== "string") return ""
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
