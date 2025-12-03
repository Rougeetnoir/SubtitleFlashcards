import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Buffer } from "node:buffer"
import { mergeTooEasyWords, runUpdateWordList } from "./scripts/lib/tooEasy.js"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tooEasyDevPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})

function tooEasyDevPlugin() {
  let syncQueue = Promise.resolve()

  return {
    name: "too-easy-dev-endpoint",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!isTooEasyRequest(req)) {
          return next()
        }

        try {
          const body = await readJsonBody(req)
          const { words, regenerate } = parseTooEasyPayload(body)
          const result = await enqueue(() => handleSync(words, regenerate))
          sendJson(res, { ok: true, ...result })
        } catch (err) {
          console.error("[too-easy] sync failed", err)
          const statusCode =
            typeof err === "object" &&
            err !== null &&
            "statusCode" in err &&
            typeof err.statusCode === "number"
              ? err.statusCode
              : 500
          const message =
            err instanceof Error ? err.message : "Unknown error while syncing"
          sendJson(res, { ok: false, error: message }, statusCode)
        }
      })
    },
  }

  function enqueue(task: () => Promise<unknown>) {
    const next = syncQueue.then(() => task())
    syncQueue = next.catch(() => {})
    return next
  }
}

function isTooEasyRequest(req: IncomingMessage) {
  return req.method === "POST" && req.url?.startsWith("/api/too-easy")
}

async function handleSync(words: string[], regenerate: boolean) {
  const result = await mergeTooEasyWords(words)
  if (regenerate) {
    await runUpdateWordList({ pruneOnly: true })
  }
  return { ...result, regenerated: regenerate }
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let totalSize = 0
  const LIMIT = 512 * 1024 // 512KB should be plenty

  return new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      totalSize += chunk.length
      if (totalSize > LIMIT) {
        const err = new Error("Payload too large")
        // @ts-expect-error custom status
        err.statusCode = 413
        req.destroy(err)
        reject(err)
        return
      }
      chunks.push(chunk)
    })

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf8")
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })

    req.on("error", (err) => {
      reject(err)
    })
  })
}

function parseTooEasyPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return { words: [], regenerate: false }
  }

  const maybeWords = (payload as { words?: unknown }).words
  const words = Array.isArray(maybeWords)
    ? maybeWords.filter((word): word is string => typeof word === "string")
    : []

  const regenerate = Boolean(
    typeof (payload as { regenerate?: unknown }).regenerate === "boolean"
      ? (payload as { regenerate?: boolean }).regenerate
      : false,
  )

  return { words, regenerate }
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200) {
  if (res.headersSent) return
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload))
}
