/**
 * API response shapes. Mirrors server/src/types/domain.ts and the controllers' view
 * functions — keep in step when either side changes.
 */
export type SessionStatus = "active" | "complete" | "incomplete" | "insufficient";

export interface PublicPersona {
  id: string;
  name: string;
  age: number;
  initial: string;
  tagline: string;
  background: string;
  traits: string[];
  openingMessage: string;
}

export interface PublicGuide {
  id: string;
  context: string;
  title: string;
  goal: string;
  estimatedMinutes: number;
  suggestedQuestions: string[];
  persona: PublicPersona;
  signalCount: number;
}

export interface Principle {
  id: string;
  name: string;
  summary: string;
  badExample: string;
  goodExample: string;
}

export interface Turn {
  index: number;
  role: "user" | "persona";
  text: string;
  createdAt?: string;
}

export interface SessionView {
  id: string;
  guideId: string;
  guideTitle: string;
  persona: { name: string; initial: string; tagline: string };
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  score: number | null;
  signalCount: number;
  turns: Turn[];
}

export interface SessionSummary {
  id: string;
  guideId: string;
  guideTitle: string;
  personaName: string;
  status: SessionStatus;
  startedAt: string;
  questionCount: number;
  score: number | null;
  focus: { skill: string }[];
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface MeResponse {
  anonymous: boolean;
  user: PublicUser | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** SSE events from POST /api/sessions/:id/turns */
export type TurnEvent =
  | { event: "accepted"; data: { index: number } }
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { turn: Turn } }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } };
