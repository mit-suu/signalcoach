import { z } from "zod";
import { QUESTION_TYPES, SIGNAL_KINDS } from "./domain";

/**
 * Schemas for guides and the principles library. Built-in guides live in server/content and are
 * validated once at boot; user-generated guides (FR-13) are validated with the same schema
 * before they are saved, so the agent never sees a malformed guide.
 */

export const SignalLayerSchema = z.object({
  depth: z.number().int().min(1).max(3), // 1 surface (the drop) · 2 behaviour (what happened) · 3 root (why it matters)
  reveal: z.string().min(1), // what the persona says when this layer unlocks
  unlockIntent: z.string().min(1), // the kind of follow-up that unlocks it (intent, not keywords)
});

export const SignalSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1), // short name shown on the scorecard
  kind: z.enum(SIGNAL_KINDS),
  difficulty: z.enum(["easy", "medium", "hard"]),
  /** Layer 1 is the signal drop itself; deeper layers are only told when the interviewer digs. */
  layers: z.array(SignalLayerSchema).min(1).refine((l) => l[0]!.depth === 1, "layers[0] must be depth 1"),
  /** Canned deflection the persona uses for a bare "why?" or a leading probe on this topic. */
  rationalization: z.string().optional(),
});

export const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().positive(),
  initial: z.string().length(1),
  tagline: z.string().min(1),
  background: z.string().min(1),
  traits: z.array(z.string()).min(1),
  speakingStyle: z.string().min(1),
  openingMessage: z.string().min(1),
});

export const GuideSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  context: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  suggestedQuestions: z.array(z.string().min(1)).min(3),
  persona: PersonaSchema,
  signals: z.array(SignalSchema).min(5),
});

export const PrincipleSchema = z.object({
  id: z.string().regex(/^P\d{2}$/),
  name: z.string().min(1),
  summary: z.string().min(1),
  badExample: z.string().min(1),
  goodExample: z.string().min(1),
  /** Question types this principle explains — lookup_interview_principle is keyed on these. */
  appliesTo: z.array(z.enum(QUESTION_TYPES)),
});

export type SignalLayer = z.infer<typeof SignalLayerSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type Guide = z.infer<typeof GuideSchema>;
export type Principle = z.infer<typeof PrincipleSchema>;
