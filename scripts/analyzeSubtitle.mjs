#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const difficultWordsJsonPath = path.join(projectRoot, "data", "difficultWords.json")

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes("--help")) {
    printUsage()
    process.exit(args.includes("--help") ? 0 : 1)
  }

  const inputPath = path.resolve(process.cwd(), args[0])
  const outFlagIndex = args.findIndex((arg) => arg === "--out" || arg === "-o")
  const outputPath =
    outFlagIndex >= 0 && args[outFlagIndex + 1]
      ? path.resolve(process.cwd(), args[outFlagIndex + 1])
      : null

  const [subtitleContent, difficultWordData] = await Promise.all([
    readFile(inputPath, "utf8"),
    loadDifficultWords(),
  ])

  const lines = parseSrt(subtitleContent)
  const stats = analyzeWords(lines, difficultWordData)
  const csv = toCsv(stats.rows)

  if (outputPath) {
    await writeFile(outputPath, csv, "utf8")
    console.log(
      `Wrote ${stats.rows.length - 1} words · ${stats.totalOccurrences} tokens to ${outputPath}`,
    )
  } else {
    console.log(csv)
  }
}

function printUsage() {
  console.log(`Usage: node scripts/analyzeSubtitle.mjs <subtitle.srt> [--out result.csv]

Examples:
  node scripts/analyzeSubtitle.mjs samples/subtitles/foo.srt
  node scripts/analyzeSubtitle.mjs samples/subtitles/foo.srt --out samples/foo.csv
`)
}

async function loadDifficultWords() {
  const raw = await readFile(difficultWordsJsonPath, "utf8")
  const parsed = JSON.parse(raw)
  const difficultWords = parsed.difficultWords || []
  const map = new Map(
    difficultWords.map((entry) => [entry.word.toLowerCase(), entry]),
  )
  return {
    map,
    list: new Set(parsed.difficultWordList || difficultWords.map((entry) => entry.word)),
  }
}

function parseSrt(content) {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  const lines = []

  for (const block of blocks) {
    const parts = block.split("\n")
    if (parts.length < 2) continue

    let idx = 0
    let id = Number(parts[idx])
    if (Number.isNaN(id)) {
      id = lines.length + 1
    } else {
      idx++
    }

    const timeLine = parts[idx] || ""
    const timeMatch =
      /(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/.exec(timeLine)
    if (!timeMatch) continue
    idx++

    const startMs = timeToMs(timeMatch[1])
    const endMs = timeToMs(timeMatch[2])

    const text = parts.slice(idx).join(" ").trim()
    if (!text) continue

    lines.push({
      id,
      startMs,
      endMs,
      text,
    })
  }

  return lines
}

function timeToMs(t) {
  const [h, m, rest] = t.split(":")
  const [s, ms] = rest.split(",")
  const hh = Number(h) || 0
  const mm = Number(m) || 0
  const ss = Number(s) || 0
  const mss = Number(ms) || 0
  return ((hh * 60 + mm) * 60 + ss) * 1000 + mss
}

function analyzeWords(lines, difficultWordData) {
  const rows = [
    [
      "word",
      "count",
      "isDifficult",
      "difficulty",
      "translation",
      "definition",
      "phonetic",
    ],
  ]

  const stats = new Map()
  let totalOccurrences = 0

  for (const line of lines) {
    const tokens = line.text.split(/\s+/)
    for (const raw of tokens) {
      const word = normalizeWord(raw)
      if (!word) continue
      totalOccurrences++
      const current = stats.get(word) || { count: 0 }
      current.count += 1
      stats.set(word, current)
    }
  }

  const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count)

  for (const [word, info] of sorted) {
    const metadata = difficultWordData.map.get(word)
    rows.push([
      word,
      String(info.count),
      metadata ? "yes" : "no",
      metadata?.difficulty ?? "",
      metadata?.translation ?? "",
      metadata?.definition ?? "",
      metadata?.phonetic ?? "",
    ])
  }

  return { rows, totalOccurrences }
}

function normalizeWord(input) {
  return input.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

function toCsv(rows) {
  return rows
    .map((columns) =>
      columns
        .map((value) => {
          if (value === null || value === undefined) return ""
          const stringValue = String(value)
          if (/[",\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        .join(","),
    )
    .join("\n")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
