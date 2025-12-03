import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  FileText,
  ListChecks,
  Sparkles,
  Upload,
  Volume2,
} from "lucide-react"

import {
  difficultWordList,
  difficultWords,
  type WordDifficulty,
} from "@/data/difficultWords"
import type { SubtitleLine } from "@/types"
import { parseSrt } from "@/utils/parseSrt"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface WordOccurrence {
  subtitleId: number
  startMs: number
  endMs: number
  text: string
}

interface ExtractedWord {
  word: string
  occurrences: number
  translation?: string
  phonetic?: string
  difficulty: WordDifficulty
  contexts: WordOccurrence[]
}

const MAX_WORDS_DISPLAY = 50
const MAX_CONTEXTS_PREVIEW = 3
const DIFFICULT_WORD_SET = new Set(
  difficultWordList.map((w) => w.toLowerCase()),
)
const DIFFICULT_WORD_MAP = new Map(
  difficultWords.map((entry) => [entry.word.toLowerCase(), entry]),
)

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "--:--"
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = [
    hours > 0 ? String(hours).padStart(2, "0") : null,
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].filter(Boolean)
  return parts.join(":")
}

function App() {
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([])
  const [words, setWords] = useState<ExtractedWord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tooEasyWords, setTooEasyWords] = useState<string[]>([])
  const [speechSupported, setSpeechSupported] = useState(false)
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle")
  const [syncMode, setSyncMode] = useState<"merge" | "regen">("merge")
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<
    { added: number; total: number; regenerated?: boolean } | null
  >(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const speechVoiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const isDev = import.meta.env.DEV

  const totalOccurrences = useMemo(
    () => words.reduce((sum, word) => sum + word.occurrences, 0),
    [words],
  )

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    try {
      const text = await file.text()
      const lines = parseSrt(text)
      setSubtitleLines(lines)

      const wordStats: Record<string, ExtractedWord> = {}

      for (const line of lines) {
        const tokens = line.text.split(/\s+/)
        const seenInLine = new Set<string>()
        for (const raw of tokens) {
          const w = normalizeWord(raw)
          if (!w) continue
          if (seenInLine.has(w)) continue
          if (!DIFFICULT_WORD_SET.has(w)) continue
          seenInLine.add(w)

          const metadata = DIFFICULT_WORD_MAP.get(w)
          if (!wordStats[w]) {
            wordStats[w] = {
              word: w,
              occurrences: 0,
              translation: metadata?.translation,
              phonetic: metadata?.phonetic,
              difficulty: metadata?.difficulty || "foundation",
              contexts: [],
            }
          }

          const entry = wordStats[w]
          entry.occurrences += 1
          entry.contexts.push({
            subtitleId: line.id,
            startMs: line.startMs,
            endMs: line.endMs,
            text: line.text.trim(),
          })
        }
      }

      const extracted = Object.values(wordStats)
        .sort((a, b) => b.occurrences - a.occurrences)

      setWords(extracted)
    } catch (err) {
      console.error(err)
      setError("解析字幕时出错，请确认是有效的 .srt 文件")
      setSubtitleLines([])
      setWords([])
    }
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("subtitle-flashcards-too-easy")
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setTooEasyWords(parsed.filter((word): word is string => typeof word === "string"))
      }
    } catch (err) {
      console.error("Failed to restore too-easy words", err)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      return
    }

    const synth = window.speechSynthesis

    function selectVoice() {
      const voices = synth.getVoices()
      if (voices.length === 0) return
      const preferred =
        voices.find((voice) => voice.lang?.toLowerCase() === "en-us") ??
        voices.find((voice) => voice.lang?.toLowerCase().includes("en-us")) ??
        voices.find((voice) => voice.lang?.toLowerCase().startsWith("en")) ??
        voices[0]

      speechVoiceRef.current = preferred ?? null
      setSpeechSupported(true)
    }

    selectVoice()
    const previousHandler = synth.onvoiceschanged
    synth.addEventListener?.("voiceschanged", selectVoice)
    synth.onvoiceschanged = selectVoice

    return () => {
      synth.removeEventListener?.("voiceschanged", selectVoice)
      if (synth.onvoiceschanged === selectVoice) {
        synth.onvoiceschanged = previousHandler ?? null
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      "subtitle-flashcards-too-easy",
      JSON.stringify(Array.from(new Set(tooEasyWords))),
    )
  }, [tooEasyWords])

  const tooEasySet = useMemo(() => new Set(tooEasyWords), [tooEasyWords])

  const displayedWords = words.slice(0, MAX_WORDS_DISPLAY)

  function toggleTooEasy(word: string) {
    setTooEasyWords((prev) => {
      if (prev.includes(word)) {
        return prev.filter((w) => w !== word)
      }
      return [...prev, word]
    })
  }

  async function copyTooEasyToClipboard() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(tooEasyWords, null, 2))
    } catch (err) {
      console.error("Failed to copy too-easy words", err)
    }
  }

  function downloadTooEasyJson() {
    const blob = new Blob([JSON.stringify(tooEasyWords, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `too-easy-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const speakWord = useCallback(
    (word: string) => {
      if (!speechSupported || typeof window === "undefined") return
      try {
        const synth = window.speechSynthesis
        synth.cancel()
        const utterance = new SpeechSynthesisUtterance(word)
        const voice = speechVoiceRef.current
        if (voice) {
          utterance.voice = voice
          utterance.lang = voice.lang ?? "en-US"
        } else {
          utterance.lang = "en-US"
        }
        utterance.rate = 0.95
        synth.speak(utterance)
      } catch (err) {
        console.error("Failed to speak word", err)
      }
    },
    [speechSupported],
  )

  async function syncTooEasyWordsToRepo(options?: { regenerate?: boolean }) {
    if (!isDev || tooEasyWords.length === 0) return
    const regenerate = Boolean(options?.regenerate)
    setSyncMode(regenerate ? "regen" : "merge")
    setSyncStatus("syncing")
    setSyncError(null)
    try {
      const response = await fetch("/api/too-easy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          words: tooEasyWords,
          regenerate,
        }),
      })
      const textOnError = await (async () => {
        if (response.ok) return null
        try {
          const text = await response.text()
          return text || null
        } catch {
          return null
        }
      })()

      if (!response.ok) {
        throw new Error(textOnError || "同步失败，请检查终端日志")
      }

      const data = (await response.json().catch(() => null)) as
        | { added?: number; total?: number; regenerated?: boolean }
        | null
      if (data && typeof data.added === "number" && typeof data.total === "number") {
        setSyncResult({
          added: data.added,
          total: data.total,
          regenerated: Boolean(data.regenerated),
        })
      } else {
        setSyncResult(null)
      }
      setSyncStatus("success")
      window.setTimeout(() => {
        setSyncStatus("idle")
      }, 4000)
    } catch (err) {
      setSyncStatus("error")
      setSyncResult(null)
      setSyncError(err instanceof Error ? err.message : "同步失败，请稍后重试")
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 sm:py-12">
      <main className="container relative z-10 max-w-5xl space-y-10 py-4 lg:py-10">
        <section className="flex flex-col items-center rounded-[32px] border border-border/50 bg-card/80 px-6 py-10 text-center shadow-[0_40px_90px_rgba(101,123,131,0.2)] backdrop-blur">
          <Badge
            variant="secondary"
            className="mb-4 border-primary/30 bg-primary/15 text-primary tracking-[0.35em] uppercase"
          >
            Beta · Vocabulary Lab
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Subtitle Flashcards
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            上传一份 <code>.srt</code> 字幕文件，我们会解析出台词、匹配 TOEFL/GRE
            示例难词，并按出现频次排序，帮助你快速做成记忆卡片。
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <Card className="border-border/50 bg-card/80 shadow-[0_25px_70px_rgba(101,123,131,0.15)] backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Upload className="h-5 w-5 text-primary" />
                  上传字幕
                </CardTitle>
                <CardDescription>
                  支持标准 <code>.srt</code>{" "}
                  文件，解析完全在浏览器本地完成，保证安全。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  accept=".srt"
                  ref={fileInputRef}
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择字幕文件
                </Button>

                <div className="rounded-2xl border border-dashed border-border/40 bg-background/70 p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">使用建议</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>建议选择 15-45 分钟的剧集片段，词频更集中</li>
                    <li>支持双语字幕，我们会仅提取英文词汇</li>
                    <li>若需要更长的清单，可拆分字幕后多次上传</li>
                  </ul>
                </div>

                {subtitleLines.length > 0 && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                    <p className="font-medium text-primary">
                      已解析 {subtitleLines.length} 行字幕
                    </p>
                    <p className="text-muted-foreground">
                      共检测到 {words.length} 个难词，按频次排序如下。
                    </p>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>解析失败</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5 shadow-[0_20px_60px_rgba(38,139,210,0.2)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  难词统计
                </CardTitle>
                <CardDescription>解析后可快速浏览整体表现。</CardDescription>
              </CardHeader>
              <CardContent>
                {words.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    上传字幕后，这里会显示字幕行数、唯一难词和总频次。
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/40 bg-background/80 p-4 shadow-sm">
                      <p className="text-xs uppercase text-muted-foreground">
                        字幕行数
                      </p>
                      <p className="text-2xl font-semibold">
                        {subtitleLines.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/40 bg-background/80 p-4 shadow-sm">
                      <p className="text-xs uppercase text-muted-foreground">
                        唯一难词
                      </p>
                      <p className="text-2xl font-semibold">{words.length}</p>
                    </div>
                    <div className="rounded-2xl border border-border/40 bg-background/80 p-4 shadow-sm">
                      <p className="text-xs uppercase text-muted-foreground">
                        总频次
                      </p>
                      <p className="text-2xl font-semibold">{totalOccurrences}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-accent/30 bg-card/85 shadow-[0_25px_70px_rgba(181,137,0,0.2)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="h-5 w-5 text-primary" />
                  Too Easy 控制台
                </CardTitle>
                <CardDescription>
                  管理已标记的常见词，随时导出合并。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  当前已标记 <span className="font-semibold">{tooEasyWords.length}</span> 个词。
                </p>
                <p className="text-xs text-muted-foreground">
                  导出为 JSON 后运行 <code>npm run apply-too-easy -- path/to/file.json</code>{" "}
                  即可同步到 <code>data/excludedWords.json</code>。
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={downloadTooEasyJson}
                    disabled={tooEasyWords.length === 0}
                  >
                    下载 JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyTooEasyToClipboard}
                    disabled={tooEasyWords.length === 0}
                  >
                    复制内容
                  </Button>
                </div>
                {isDev && (
                  <div className="space-y-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      本地开发中可直接写入 <code>data/excludedWords.json</code>{" "}
                      ，需要重新生成难词文件时再另外触发。
                    </p>
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => syncTooEasyWordsToRepo({ regenerate: false })}
                          disabled={
                            tooEasyWords.length === 0 || syncStatus === "syncing"
                          }
                        >
                          {syncStatus === "syncing" && syncMode === "merge"
                            ? "写入中..."
                            : "写入排除词"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncTooEasyWordsToRepo({ regenerate: true })}
                          disabled={
                            tooEasyWords.length === 0 || syncStatus === "syncing"
                          }
                        >
                          {syncStatus === "syncing" && syncMode === "regen"
                            ? "重建中..."
                            : "写入并重建词库"}
                        </Button>
                        {syncStatus === "success" && (
                          <span className="text-green-600">
                            已写入 {syncResult ? `新增 ${syncResult.added} 个词` : "成功"}
                            {syncResult?.regenerated
                              ? "，并快速更新词库文件。"
                              : "。"}
                          </span>
                        )}
                        {syncStatus === "error" && (
                          <span className="text-red-500">
                            {syncError || "同步失败，请查看终端输出。"}
                          </span>
                        )}
                      </div>
                      {syncStatus !== "error" && syncResult && syncStatus !== "syncing" && (
                        <span className="text-muted-foreground">
                          当前排除词库共 {syncResult.total} 个词。
                          {syncResult.regenerated ? (
                            <>
                              {" "}
                              已基于最新排除词快速更新{" "}
                              <code>src/data/difficultWords.ts</code>。若修改了{" "}
                              <code>data/wordSources.json</code>{" "}
                              等配置，仍需运行 <code>npm run update-word-list</code>{" "}
                              完整重建。
                            </>
                          ) : (
                            <>
                              {" "}
                              如需更新 <code>src/data/difficultWords.ts</code>{" "}
                              ，可点击“写入并重建”或运行{" "}
                              <code>npm run update-word-list</code>。
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 bg-card/85 shadow-[0_40px_100px_rgba(101,123,131,0.2)] backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5 text-primary" />
                难词列表
              </CardTitle>
              <CardDescription>
                词表长度：{words.length} 个；总出现次数：{totalOccurrences} 次。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {words.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 bg-card/70 p-10 text-center text-muted-foreground">
                  <FileText className="mb-4 h-10 w-10" />
                  <p className="font-medium text-foreground/80">
                    还没有数据
                  </p>
                  <p className="text-sm">
                    上传字幕后，筛选结果会显示在这里。
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <ScrollArea className="h-[70vh] rounded-2xl border border-border/40 bg-card/70 px-2 py-4 backdrop-blur-sm">
                    <ul className="space-y-3 pr-2">
                      {displayedWords.map((word) => (
                        <li
                          key={word.word}
                          className="space-y-3 rounded-2xl border border-border/30 bg-card/80 px-4 py-4 text-sm shadow-sm"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <ListChecks className="h-4 w-4 text-muted-foreground" />
                                <div className="flex flex-col">
                                  <span className="font-semibold capitalize">
                                    {word.word}
                                  </span>
                                  {(word.phonetic || speechSupported) && (
                                    <div className="flex items-center gap-1">
                                      {word.phonetic && (
                                        <span className="text-xs text-muted-foreground">
                                          /{word.phonetic}/
                                        </span>
                                      )}
                                      {speechSupported && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-muted-foreground"
                                          onClick={() => speakWord(word.word)}
                                          aria-label={`播放 ${word.word} 的美式发音`}
                                        >
                                          <Volume2 className="h-4 w-4" />
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {word.translation || "暂无翻译数据"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:items-center">
                              <Badge variant="outline" className="whitespace-nowrap">
                                出现 {word.occurrences} 次
                              </Badge>
                              <Badge variant="secondary" className="whitespace-nowrap">
                                {word.difficulty === "foundation"
                                  ? "基础"
                                  : word.difficulty === "intermediate"
                                    ? "进阶"
                                    : "高阶"}
                              </Badge>
                              <Button
                                variant={tooEasySet.has(word.word) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleTooEasy(word.word)}
                                className="whitespace-nowrap"
                              >
                                {tooEasySet.has(word.word) ? "已标记为太简单" : "太简单"}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1 text-xs">
                            {word.contexts.slice(0, MAX_CONTEXTS_PREVIEW).map(
                              (context, idx) => (
                                <div
                                  key={`${word.word}-${context.subtitleId}-${idx}`}
                                  className="rounded-xl border border-border/30 bg-background/80 px-3 py-2 shadow-inner"
                                >
                                  <p className="font-medium text-foreground">
                                    {formatTimestamp(context.startMs)} · 第{" "}
                                    {context.subtitleId} 行
                                  </p>
                                  <p className="text-muted-foreground">
                                    {context.text}
                                  </p>
                                </div>
                              ),
                            )}
                            {word.contexts.length > MAX_CONTEXTS_PREVIEW && (
                              <p className="text-[11px] text-muted-foreground">
                                还有 {word.contexts.length - MAX_CONTEXTS_PREVIEW}{" "}
                                处出现
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>

                  {words.length > MAX_WORDS_DISPLAY && (
                    <p className="text-xs text-muted-foreground">
                      仅展示前 {MAX_WORDS_DISPLAY} 个高频词，导出功能即将上线。
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

export default App
