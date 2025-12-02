import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  FileText,
  ListChecks,
  Sparkles,
  Upload,
} from "lucide-react"

import { difficultWords } from "@/data/difficultWords"
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

interface ExtractedWord {
  word: string
  occurrences: number
}

const MAX_WORDS_DISPLAY = 50

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "")
}

function App() {
  const [subtitleLines, setSubtitleLines] = useState<SubtitleLine[]>([])
  const [words, setWords] = useState<ExtractedWord[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

      const wordCount: Record<string, number> = {}
      const difficultSet = new Set(difficultWords.map((w) => w.toLowerCase()))

      for (const line of lines) {
        const tokens = line.text.split(/\s+/)
        for (const raw of tokens) {
          const w = normalizeWord(raw)
          if (!w) continue
          if (!difficultSet.has(w)) continue
          wordCount[w] = (wordCount[w] || 0) + 1
        }
      }

      const extracted: ExtractedWord[] = Object.entries(wordCount)
        .map(([word, occurrences]) => ({ word, occurrences }))
        .sort((a, b) => b.occurrences - a.occurrences)

      setWords(extracted)
    } catch (err) {
      console.error(err)
      setError("解析字幕时出错，请确认是有效的 .srt 文件")
      setSubtitleLines([])
      setWords([])
    }
  }

  const displayedWords = words.slice(0, MAX_WORDS_DISPLAY)

  return (
    <div className="min-h-screen bg-muted/30">
      <main className="container max-w-5xl space-y-8 py-12">
        <div className="flex flex-col items-center text-center">
          <Badge variant="secondary" className="mb-3">
            Beta · Vocabulary Lab
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight">
            Subtitle Flashcards
          </h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">
            上传一份 <code>.srt</code> 字幕文件，我们会解析出台词、匹配 TOEFL/GRE
            示例难词，并按出现频次排序，帮助你快速做成记忆卡片。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-muted-foreground/20">
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

              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">使用建议</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>建议选择 15-45 分钟的剧集片段，词频更集中</li>
                  <li>支持双语字幕，我们会仅提取英文词汇</li>
                  <li>若需要更长的清单，可拆分字幕后多次上传</li>
                </ul>
              </div>

              {subtitleLines.length > 0 && (
                <div className="rounded-xl bg-primary/5 p-4 text-sm">
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

          <Card className="border-muted-foreground/20">
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
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-muted/60 bg-muted/20 p-10 text-center text-muted-foreground">
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
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-xs uppercase text-muted-foreground">
                        字幕行数
                      </p>
                      <p className="text-2xl font-semibold">
                        {subtitleLines.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-xs uppercase text-muted-foreground">
                        唯一难词
                      </p>
                      <p className="text-2xl font-semibold">{words.length}</p>
                    </div>
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-xs uppercase text-muted-foreground">
                        总频次
                      </p>
                      <p className="text-2xl font-semibold">
                        {totalOccurrences}
                      </p>
                    </div>
                  </div>

                  <ScrollArea className="h-[360px] rounded-2xl border bg-background px-2 py-4">
                    <ul className="space-y-3 pr-2">
                      {displayedWords.map((word) => (
                        <li
                          key={word.word}
                          className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3 text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <ListChecks className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold capitalize">
                              {word.word}
                            </span>
                          </div>
                          <Badge variant="outline">
                            出现 {word.occurrences} 次
                          </Badge>
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
