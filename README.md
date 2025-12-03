# Subtitle Flashcards

Subtitle Flashcards helps you turn TOEFL/GRE-level vocabulary hidden in English subtitles into lightweight study decks. Upload any `.srt` file and the app parses it locally, matches against a curated difficult-word list, and surfaces the highest-frequency words so you can review them in context.

## Highlights

- 🚀 **Local parsing** – all subtitle processing happens in the browser, so your file never leaves the device.
- 📚 **Curated word bank** – ships with a TOEFL/GRE difficult-word list and only counts the words that appear in it.
- 📈 **Stats at a glance** – shows total subtitle lines, unique difficult words, and aggregate occurrences.
- 🧾 **Top-word list** – ranks the 50 most frequent difficult words to accelerate manual flashcard creation.
- 💬 **Context + translation** – each word comes with CC-CEDICT-style中文释义和出现时间/台词，方便理解与定位。

## How to Use

1. Open the deployed app or run the local dev server.
2. Click “Choose subtitle file” on the left panel and upload an `.srt` file (bilingual subtitles are fine; only English words are extracted).
3. Review the stats and high-frequency list to build cards or export the data elsewhere.

## Local Development

```bash
npm install        # install dependencies
npm run dev        # start the dev server
npm run build      # create a production build
npm run preview    # preview the production build
```

The project uses React, TypeScript, Vite, Tailwind CSS, and shadcn/ui components. Main logic lives under `src/`, with the core workflow in `src/App.tsx`.

## Updating the Difficult-Word List

The file `src/data/difficultWords.ts` is auto-generated. To tweak the vocabulary bank:

1. Edit `data/wordSources.json` to adjust sources, difficulty tiers, or manual words. Each entry can either point to a manual list or describe a frequency range from the SUBTLEXus spoken corpus.
2. Run `npm run update-word-list` to regenerate `src/data/difficultWords.ts`.
3. Restart the dev server (if running) so Vite picks up the changes.

This setup lets us manage layered word sources—foundation, intermediate, advanced—without touching application code. Optional helpers:

- `data/ngsl.csv` — drop the New General Service List here (e.g., the 2.8k-word CSV). The update script will merge it with the top SUBTLEX words to auto-build a **common words** blacklist.
- `data/commonWords.json` — generated union of NGSL + SUBTLEX 高频词，可供其他工具复用。
- `data/excludedWords.json` — 手动跳过的单词列表（例如常见动词派生）。
- 生成脚本会同步写出 `data/difficultWords.json`，供命令行工具或其他服务读取。
- The generator normalizes词形（使用 ecdict 的 `findLemma`）并自动挂上 CC-CEDICT 释义/音标。

### Subtitle Word Analysis CLI

Use the helper CLI to inspect any `.srt` file and export every word it uses together with counts + difficulty metadata:

```bash
npm run analyze-subtitle -- samples/subtitles/Stranger.things.S04E08.GGEZ.English-WWW.MY-SUBS.CO.srt --out analysis.csv
```

The CSV columns are `word,count,isDifficult,difficulty,translation,definition,phonetic`. Omit `--out` to print to stdout.

### Marking "Too Easy" Words

- 在 UI 的难词列表中点击 “太简单” 按钮即可标记/取消，该状态会保存在浏览器 `localStorage`。
- 点击列表下方的 “下载 JSON” 或 “复制内容” 获取 `too-easy` 清单。
- 运行 `npm run apply-too-easy -- path/to/too-easy.json` 可将这些词合并进 `data/excludedWords.json`，随后再执行 `npm run update-word-list` 让前端忽略这些词。

## Roadmap

- Export the word list to CSV/Anki.
- Allow custom difficult-word lists.
- Add accounts to store multiple parsing sessions.
