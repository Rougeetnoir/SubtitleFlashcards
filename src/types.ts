export interface SubtitleLine {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface WordCard {
  word: string;
  occurrences: number;
  example: SubtitleLine;
}
