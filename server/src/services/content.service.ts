import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GuideSchema, PrincipleSchema, SampleTranscriptSchema, type Guide, type Principle, type SampleTranscript } from "../types/content";
import { parseTranscript, resolveSpeaker } from "../agent/transcriptParser";
import type { QuestionType } from "../types/domain";
import { notFound } from "../utils/errors";

/**
 * Guides and the principles library are static JSON in server/content (versioned with code,
 * not in Mongo). Loaded and validated once at boot — a malformed file stops the server.
 * Path resolves from both src/ (tsx) and dist/ (node), since both sit one level below server/.
 */
const CONTENT_DIR = path.resolve(__dirname, "..", "..", "content");

let guides: Map<string, Guide> | null = null;
let principles: Principle[] | null = null;
let transcripts: SampleTranscript[] | null = null;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadContent(): { guides: number; principles: number; transcripts: number } {
  const guideDir = path.join(CONTENT_DIR, "guides");
  const loaded = new Map<string, Guide>();
  for (const file of readdirSync(guideDir).filter((f) => f.endsWith(".json")).sort()) {
    const result = GuideSchema.safeParse(readJson(path.join(guideDir, file)));
    if (!result.success) throw new Error(`Invalid guide ${file}: ${z.prettifyError(result.error)}`);
    if (loaded.has(result.data.id)) throw new Error(`Duplicate guide id ${result.data.id}`);
    loaded.set(result.data.id, result.data);
  }
  guides = loaded;

  const result = z.array(PrincipleSchema).safeParse(readJson(path.join(CONTENT_DIR, "principles.json")));
  if (!result.success) throw new Error(`Invalid principles.json: ${z.prettifyError(result.error)}`);
  principles = result.data;

  // Sample transcripts must parse, name a real interviewer, and quote their expected signals verbatim.
  const transcriptDir = path.join(CONTENT_DIR, "transcripts");
  const samples: SampleTranscript[] = [];
  for (const file of readdirSync(transcriptDir).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = SampleTranscriptSchema.safeParse(readJson(path.join(transcriptDir, file)));
    if (!parsed.success) throw new Error(`Invalid transcript ${file}: ${z.prettifyError(parsed.error)}`);
    const { turns, speakers } = parseTranscript(parsed.data.lines.join("\n"));
    if (!resolveSpeaker(speakers, parsed.data.me)) throw new Error(`Transcript ${file}: "me" is not a speaker`);
    for (const s of parsed.data.expected.signals) {
      if (!turns[s.turn]?.text.includes(s.quote)) throw new Error(`Transcript ${file}: expected quote not in turn #${s.turn}`);
    }
    samples.push(parsed.data);
  }
  transcripts = samples;

  return { guides: guides.size, principles: principles.length, transcripts: transcripts.length };
}

function ensureLoaded() {
  if (!guides || !principles || !transcripts) loadContent();
  return { guides: guides!, principles: principles!, transcripts: transcripts! };
}

export function listGuides(): Guide[] {
  return [...ensureLoaded().guides.values()];
}

export function getGuide(id: string): Guide {
  const guide = ensureLoaded().guides.get(id);
  if (!guide) throw notFound("Guide");
  return guide;
}

export function tryGetGuide(id: string): Guide | undefined {
  return ensureLoaded().guides.get(id);
}

/** What the browser may see: signal contents stay server-side (FR-4 break-character safety). */
export function toPublicGuide(guide: Guide) {
  const { signals, persona, ...rest } = guide;
  const { speakingStyle: _style, ...publicPersona } = persona;
  return { ...rest, persona: publicPersona, signalCount: signals.length };
}

export function listPrinciples(): Principle[] {
  return ensureLoaded().principles;
}

/**
 * The agent's lookup_interview_principle tool (FR-7): the one tool that brings in knowledge the
 * model does not hold. Called only when there is feedback to write; feedback that maps to no
 * principle is dropped by the self-check (FR-6).
 */
export function lookupPrinciple(mistake: QuestionType): Principle | undefined {
  return ensureLoaded().principles.find((p) => p.appliesTo.includes(mistake));
}

/** Built-in sample transcripts, `text` joined from the stored lines. */
export function listSampleTranscripts(): (SampleTranscript & { text: string })[] {
  return ensureLoaded().transcripts.map((t) => ({ ...t, text: t.lines.join("\n") }));
}
