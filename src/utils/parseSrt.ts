import type { SubtitleLine } from "../types";

// 简化版 SRT 解析：足够我们先用起来，之后可以逐步增强
export function parseSrt(content: string): SubtitleLine[] {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const lines: SubtitleLine[] = [];

  for (const block of blocks) {
    const parts = block.split("\n");
    if (parts.length < 2) continue;

    let idx = 0;
    // 第一行可能是编号
    let id = Number(parts[idx]);
    if (Number.isNaN(id)) {
      id = lines.length + 1;
    } else {
      idx++;
    }

    // 时间行
    const timeLine = parts[idx] || "";
    const timeMatch =
      /(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})/.exec(
        timeLine
      );
    if (!timeMatch) continue;
    idx++;

    const startMs = timeToMs(timeMatch[1]);
    const endMs = timeToMs(timeMatch[2]);

    // 剩下的是台词文本
    const text = parts.slice(idx).join(" ").trim();
    if (!text) continue;

    lines.push({
      id,
      startMs,
      endMs,
      text,
    });
  }

  return lines;
}

function timeToMs(t: string): number {
  const [h, m, rest] = t.split(":");
  const [s, ms] = rest.split(",");
  const hh = Number(h) || 0;
  const mm = Number(m) || 0;
  const ss = Number(s) || 0;
  const mss = Number(ms) || 0;
  return ((hh * 60 + mm) * 60 + ss) * 1000 + mss;
}
