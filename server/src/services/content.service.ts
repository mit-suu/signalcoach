import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GuideSchema, PrincipleSchema, type Guide, type Principle } from "../types/content";
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

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadContent(): { guides: number; principles: number } {
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

  return { guides: guides.size, principles: principles.length };
}

function ensureLoaded() {
  if (!guides || !principles) loadContent();
  return { guides: guides!, principles: principles! };
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
