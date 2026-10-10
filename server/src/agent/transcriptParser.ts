/**
 * TRANSCRIPT PARSER — pure code, no LLM (decision 2026-10-11: speakers are parsed, not guessed).
 *
 * Format: one `Tên: nội dung` line per turn. A line without a speaker prefix continues the
 * previous turn; consecutive lines by the same speaker merge into one turn. Leading timestamps
 * like `[00:01:23]` or `00:12` and list dashes are ignored. Text before the first speaker line
 * (a title, a note) is dropped.
 *
 * client/src/lib/transcript.ts mirrors SPEAKER_LINE for the speaker picker — keep them in step.
 */
export interface ParsedTurn {
  index: number;
  speaker: string;
  text: string;
}

export interface ParsedTranscript {
  turns: ParsedTurn[];
  /** Distinct speakers in order of first appearance (spelling of the first occurrence). */
  speakers: string[];
}

/** Leading timestamp / bullet, removed before looking for a speaker. */
const LEAD = /^\s*(?:[-*•]\s*)?(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*(?:[-–]\s*)?)?/;
/** A speaker label: starts with a letter, ≤ 32 chars, ≤ 4 words, no sentence punctuation. */
const SPEAKER_LINE = /^(\p{L}[\p{L}\p{N} ._'’()-]{0,31}?)\s*[:：]\s*(.*)$/u;
const MAX_SPEAKER_WORDS = 4;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
export const speakerKey = (s: string) => squash(s).toLowerCase();

export function parseSpeakerLine(line: string): { speaker: string; text: string } | null {
  const body = line.replace(LEAD, "");
  const m = SPEAKER_LINE.exec(body);
  if (!m) return null;
  const speaker = squash(m[1]!);
  if (!speaker || speaker.split(" ").length > MAX_SPEAKER_WORDS) return null;
  return { speaker, text: m[2]!.trim() };
}

export function parseTranscript(raw: string): ParsedTranscript {
  const turns: ParsedTurn[] = [];
  const spelling = new Map<string, string>();

  for (const rawLine of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = parseSpeakerLine(line);
    const last = turns.at(-1);
    if (!parsed) {
      if (last) last.text = last.text ? `${last.text}\n${line}` : line; // continuation line
      continue;
    }
    const key = speakerKey(parsed.speaker);
    if (!spelling.has(key)) spelling.set(key, parsed.speaker);
    const speaker = spelling.get(key)!;
    if (last && last.speaker === speaker) {
      if (parsed.text) last.text = last.text ? `${last.text}\n${parsed.text}` : parsed.text;
      continue;
    }
    turns.push({ index: turns.length, speaker, text: parsed.text });
  }

  // A speaker line with nothing after it and no continuation is not a turn.
  const kept = turns.filter((t) => t.text.trim()).map((t, index) => ({ ...t, index }));
  // Re-merge neighbours that became adjacent after dropping empty turns.
  const merged: ParsedTurn[] = [];
  for (const t of kept) {
    const prev = merged.at(-1);
    if (prev && prev.speaker === t.speaker) prev.text = `${prev.text}\n${t.text}`;
    else merged.push({ ...t, index: merged.length });
  }
  const speakers = [...new Set(merged.map((t) => t.speaker))];
  return { turns: merged, speakers };
}

/** Resolve the user's "me" choice against the parsed speakers (case/whitespace-insensitive). */
export function resolveSpeaker(speakers: string[], me: string): string | undefined {
  const key = speakerKey(me);
  return speakers.find((s) => speakerKey(s) === key);
}
