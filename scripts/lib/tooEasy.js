import { readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..", "..")
const exclusionPath = path.join(projectRoot, "data", "excludedWords.json")
const updateScriptPath = path.join(projectRoot, "scripts", "updateWordList.mjs")

export async function mergeTooEasyFromFile(filePath) {
  const incoming = await readJsonSafe(filePath, [])
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return {
      added: 0,
      total: await getExistingCount(),
      skipped: true,
    }
  }
  return mergeTooEasyWords(incoming)
}

export async function mergeTooEasyWords(words) {
  const sanitized = Array.isArray(words) ? words : []
  const existing = await readJsonSafe(exclusionPath, [])
  const normalizedExisting = existing
    .filter((word) => typeof word === "string")
    .map((word) => normalizeWord(word))
    .filter(Boolean)

  const merged = new Set(normalizedExisting)
  let added = 0

  for (const word of sanitized) {
    const normalized = normalizeWord(word)
    if (!normalized) continue
    const sizeBefore = merged.size
    merged.add(normalized)
    if (merged.size > sizeBefore) added += 1
  }

  const sorted = Array.from(merged).sort()
  await writeFile(exclusionPath, JSON.stringify(sorted, null, 2), "utf8")

  return { added, total: sorted.length }
}

export function normalizeWord(word) {
  if (!word || typeof word !== "string") return ""
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

export async function runUpdateWordList(options = {}) {
  const args = []
  if (options.pruneOnly) {
    args.push("--prune-only")
  }
  await runScript(updateScriptPath, args)
}

async function getExistingCount() {
  const existing = await readJsonSafe(exclusionPath, [])
  return Array.isArray(existing) ? existing.length : 0
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function runScript(targetPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [targetPath, ...args], {
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${path.basename(targetPath)} exited with code ${code}`))
    })
  })
}

export const tooEasyPaths = {
  projectRoot,
  exclusionPath,
  updateScriptPath,
}
