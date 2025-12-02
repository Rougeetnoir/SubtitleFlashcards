# Subtitle Flashcards

Subtitle Flashcards helps you turn TOEFL/GRE-level vocabulary hidden in English subtitles into lightweight study decks. Upload any `.srt` file and the app parses it locally, matches against a curated difficult-word list, and surfaces the highest-frequency words so you can review them in context.

## Highlights

- 🚀 **Local parsing** – all subtitle processing happens in the browser, so your file never leaves the device.
- 📚 **Curated word bank** – ships with a TOEFL/GRE difficult-word list and only counts the words that appear in it.
- 📈 **Stats at a glance** – shows total subtitle lines, unique difficult words, and aggregate occurrences.
- 🧾 **Top-word list** – ranks the 50 most frequent difficult words to accelerate manual flashcard creation.

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

## Roadmap

- Export the word list to CSV/Anki.
- Allow custom difficult-word lists.
- Add accounts to store multiple parsing sessions.
