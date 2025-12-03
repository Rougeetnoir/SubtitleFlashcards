#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const configPath = path.join(projectRoot, "data", "wordSources.json")
const exclusionPath = path.join(projectRoot, "data", "excludedWords.json")
const ngslPath = path.join(projectRoot, "data", "ngsl.csv")
const commonWordsPath = path.join(projectRoot, "data", "commonWords.json")
const outputPath = path.join(projectRoot, "src", "data", "difficultWords.ts")
const jsonOutputPath = path.join(projectRoot, "data", "difficultWords.json")

const SUBTLEX_TOTAL_TOKENS = 51_000_000
const SUBTLEX_COMMON_LIMIT = 5000
const difficultyOrder = ["foundation", "intermediate", "advanced"]
const difficultyRank = new Map(difficultyOrder.map((level, index) => [level, index]))
let dictionaryModule

async function main() {
  const configRaw = await readFile(configPath, "utf8")
  const sources = JSON.parse(configRaw)
  const exclusions = await loadExclusions(exclusionPath)

  const hasSubtlexSources = sources.some((source) => source.type === "subtlexRange")
  const subtlexData = hasSubtlexSources ? loadSubtlexData() : []
  const lemmaResolver = createLemmaResolver()
  const commonWords = await loadCommonWords(ngslPath, subtlexData)
  const skipWords = new Set([...exclusions, ...commonWords])

  const aggregated = new Map()

  for (const source of sources) {
    const words = collectWordsForSource(source, subtlexData)
    for (const word of words) {
      if (!word) continue
      const normalized = normalizeWord(word)
      if (!normalized) continue
      const lemma = lemmaResolver(normalized)
      const finalWord = lemma || normalized
      if (skipWords.has(finalWord)) continue

      const current = aggregated.get(finalWord)
      if (!current) {
        aggregated.set(finalWord, {
          word: finalWord,
          difficulty: source.difficulty,
          sources: [summarizeSource(source)],
        })
        continue
      }

      current.sources.push(summarizeSource(source))
      if (
        difficultyRank.get(source.difficulty) >
        difficultyRank.get(current.difficulty)
      ) {
        current.difficulty = source.difficulty
      }
    }
  }

  const entries = [...aggregated.values()].sort((a, b) => a.word.localeCompare(b.word))
  enrichWithDictionary(entries)

  const content = generateFile(entries)
  await writeFile(outputPath, content, "utf8")
  await writeFile(
    jsonOutputPath,
    JSON.stringify(
      {
        difficultWords: entries,
        difficultWordList: entries.map((entry) => entry.word),
      },
      null,
      2,
    ),
    "utf8",
  )
  console.log(
    `Generated ${entries.length} difficult words from ${sources.length} source groups.`,
  )
}

function loadSubtlexData() {
  const require = createRequire(import.meta.url)
  const dataset = require("subtlex-word-frequencies")
  if (!Array.isArray(dataset)) {
    throw new Error("subtlex-word-frequencies did not return an array")
  }
  return dataset.map((entry) => ({
    word: entry.word,
    count: Number(entry.count ?? entry.value ?? 0),
  }))
}

function collectWordsForSource(source, subtlexData) {
  if (source.type === "manual") {
    return source.words || []
  }

  if (source.type === "subtlexRange") {
    if (!subtlexData.length) {
      throw new Error("SUBTLEX data is not available but required by config")
    }

    const filters = source.filters || {}
    const limit = source.limit ?? 500
    const allowProperNouns = Boolean(filters.allowProperNouns)
    const minLength = filters.minLength ?? 1
    const maxLength = filters.maxLength ?? Infinity
    const minCount = filters.minCount ?? 0
    const maxCount = filters.maxCount ?? Infinity
    const minSubtlwf = filters.minSubtlwf ?? 0
    const maxSubtlwf = filters.maxSubtlwf ?? Infinity
    const minLg10wf = filters.minLg10wf ?? 0
    const maxLg10wf = filters.maxLg10wf ?? Infinity

    const filtered = subtlexData.filter((entry) => {
      if (!entry.word) return false
      const normalized = entry.word.trim()
      if (!normalized) return false
      const isProper = /^[A-Z]/.test(normalized)
      if (!allowProperNouns && isProper) return false
      if (!/^[A-Za-z]+$/.test(normalized)) return false
      if (normalized.length < minLength || normalized.length > maxLength) return false

      const count = entry.count
      if (!Number.isFinite(count)) return false

      if (count < minCount || count > maxCount) return false
      const subtlwf = toSubtlwf(count)
      if (subtlwf < minSubtlwf || subtlwf > maxSubtlwf) return false

      const lg10wf = toLg10wf(count)
      if (lg10wf < minLg10wf || lg10wf > maxLg10wf) return false

      return true
    })

    const direction = source.sortDirection === "desc" ? -1 : 1
    filtered.sort((a, b) => direction * (a.count - b.count))

    return filtered.slice(0, limit).map((entry) => entry.word.toLowerCase())
  }

  throw new Error(`Unknown word source type: ${source.type}`)
}

function enrichWithDictionary(entries) {
  const dictionary = loadDictionary()
  if (!dictionary) return

  for (const entry of entries) {
    const dictEntry = dictionary.searchWord(entry.word, { caseInsensitive: true })
    if (!dictEntry) continue
    entry.translation = sanitizeDictionaryText(dictEntry.translation)
    entry.definition = sanitizeDictionaryText(dictEntry.definition)
    entry.phonetic = dictEntry.phonetic || undefined
  }
}

function loadDictionary() {
  if (dictionaryModule) return dictionaryModule
  const require = createRequire(import.meta.url)
  try {
    dictionaryModule = require("ecdict")
    if (
      !dictionaryModule ||
      typeof dictionaryModule.searchWord !== "function"
    ) {
      console.warn("ecdict did not expose expected API, translations skipped.")
      dictionaryModule = null
    }
  } catch (err) {
    console.warn("Failed to load ecdict, translations skipped.", err)
    dictionaryModule = null
  }
  return dictionaryModule
}

function sanitizeDictionaryText(text) {
  if (!text || typeof text !== "string") return undefined
  return text
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("；")
    .trim()
}

async function loadExclusions(filePath) {
  try {
    const raw = await readFile(filePath, "utf8")
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return new Set()
    return new Set(
      list
        .map((word) => (typeof word === "string" ? word.trim().toLowerCase() : ""))
        .filter((word) => /^[a-z]+$/.test(word)),
    )
  } catch {
    return new Set()
  }
}

async function loadCommonWords(ngslCsvPath, subtlexData) {
  const words = new Set()
  const ngslWords = await loadNgslWords(ngslCsvPath)
  ngslWords.forEach((word) => words.add(word))

  const subtlexCommon = subtlexData
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, SUBTLEX_COMMON_LIMIT)
    .map((entry) => normalizeWord(entry.word))
    .filter(Boolean)

  subtlexCommon.forEach((word) => words.add(word))

  await writeFile(commonWordsPath, JSON.stringify([...words], null, 2), "utf8")

  return words
}

async function loadNgslWords(filePath) {
  try {
    const raw = await readFile(filePath, "utf8")
    const lines = raw.split(/\r?\n/).map((line) => line.trim())
    const words = []
    for (const line of lines) {
      if (!line || /^[\d\s,;]+$/.test(line)) continue
      const tokens = line.split(/[,;\t]/).map((token) => token.trim())
      const candidate = tokens.find((token) => /^[A-Za-z'-]+$/.test(token))
      if (!candidate) continue
      const normalized = normalizeWord(candidate)
      if (!normalized) continue
      words.push(normalized)
    }
    return new Set(words)
  } catch {
    console.warn("NGSL file not found; continuing without external common words list.")
    return new Set()
  }
}

function createLemmaResolver() {
  const dictionary = loadDictionary()
  if (!dictionary || typeof dictionary.findLemma !== "function") {
    return () => null
  }

  return (word) => {
    try {
      const result = dictionary.findLemma(word, true)
      if (result && typeof result.word === "string") {
        const lemma = result.word.trim().toLowerCase()
        if (/^[a-z]+$/.test(lemma)) {
          return lemma
        }
      }
    } catch {
      return null
    }
    return null
  }
}

function summarizeSource(source) {
  return {
    id: source.id,
    label: source.label,
    difficulty: source.difficulty,
    source: source.source,
  }
}

function toSubtlwf(count) {
  return (count / SUBTLEX_TOTAL_TOKENS) * 1_000_000
}

function toLg10wf(count) {
  return Math.log10(count + 1)
}

function normalizeWord(w) {
  if (!w || typeof w !== "string") return ""
  return w.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

function generateFile(entries) {
  const header = `// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Run \`npm run update-word-list\` after modifying data/wordSources.json

export type WordDifficulty = "foundation" | "intermediate" | "advanced"

export interface DifficultWordSource {
  id: string
  label: string
  difficulty: WordDifficulty
  source: string
}

export interface DifficultWordEntry {
  word: string
  difficulty: WordDifficulty
  sources: DifficultWordSource[]
  translation?: string
  definition?: string
  phonetic?: string
}

export const difficultWords: DifficultWordEntry[] = `

  const entriesSerialized = JSON.stringify(entries, null, 2)
  const listSerialized = JSON.stringify(entries.map((entry) => entry.word), null, 2)

  return `${header}${entriesSerialized} as const

export const difficultWordList = ${listSerialized} as const
`
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
