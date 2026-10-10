/**
 * Client mirror of server/src/agent/transcriptParser.ts — only what the form needs to offer the
 * detected speakers and block obviously invalid input. The server parses again and is the authority;
 * keep the regexes and limits in step.
 */
export const TRANSCRIPT_MAX_CHARS = 30_000;
export const MIN_MY_TURNS = 4;

const LEAD = /^\s*(?:[-*•]\s*)?(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?\)?\]?\s*(?:[-–]\s*)?)?/;
const SPEAKER_LINE = /^(\p{L}[\p{L}\p{N} ._'’()-]{0,31}?)\s*[:：]\s*(.*)$/u;
const MAX_SPEAKER_WORDS = 4;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const key = (s: string) => squash(s).toLowerCase();

export interface DetectedSpeaker {
  name: string;
  /** Turns by this speaker (consecutive lines by the same speaker count once). */
  turns: number;
}

export function detectSpeakers(text: string): DetectedSpeaker[] {
  // Same rules as the server parser: a label-only line starts a turn that continuation lines fill;
  // consecutive turns by one speaker merge; turns that stay empty are dropped (then neighbours re-merge).
  const spelling = new Map<string, string>();
  const turns: { key: string; text: string }[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const m = SPEAKER_LINE.exec(trimmed.replace(LEAD, ""));
    const name = m ? squash(m[1]!) : "";
    const last = turns.at(-1);
    if (!m || !name || name.split(" ").length > MAX_SPEAKER_WORDS) {
      if (last) last.text += trimmed; // continuation line
      continue;
    }
    const k = key(name);
    if (!spelling.has(k)) spelling.set(k, name);
    const body = m[2]!.trim();
    if (last && last.key === k) last.text += body;
    else turns.push({ key: k, text: body });
  }
  const counts = new Map<string, number>();
  let prev: string | null = null;
  for (const t of turns) {
    if (!t.text) continue;
    if (t.key !== prev) counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
    prev = t.key;
  }
  return [...counts.entries()].map(([k, n]) => ({ name: spelling.get(k)!, turns: n }));
}
