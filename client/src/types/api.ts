/**
 * API response shapes. Mirrors server/src/types/domain.ts, types/scorecard.ts and the controllers'
 * view functions — keep in step when either side changes.
 */
export type SessionStatus = "active" | "complete" | "incomplete" | "insufficient";
export type SignalStatus = "caught" | "partial" | "missed" | "unsure" | "not_surfaced";
export type SignalKind = "emotion" | "trailing" | "contradiction" | "behavior";
export type QuestionType = "good" | "leading" | "closed" | "vague" | "double" | "future" | "bare_why" | "over_talking";
export type AgentAction = "answer" | "plant_signal" | "go_deeper" | "answer_briefly" | "clarify" | "propose_end" | "stay_in_character";

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
  custom: boolean;
  createdAt: string | null;
}

export interface GuideBrief {
  product: string;
  audience: string;
  goal?: string;
  notes?: string;
}

export interface Principle {
  id: string;
  name: string;
  summary: string;
  badExample: string;
  goodExample: string;
  appliesTo: QuestionType[];
}

export interface ToolCall {
  name: "seed_signal" | "update_signal_status" | "reveal_layer" | "end_session" | "lookup_interview_principle";
  args: Record<string, unknown>;
  ok: boolean;
  note?: string;
}

export interface Turn {
  index: number;
  role: "user" | "persona";
  text: string;
  createdAt?: string;
  // Present only once the session has ended (agent log, S13)
  questionType?: QuestionType | null;
  judgeNote?: string | null;
  signalId?: string | null;
  layerDepth?: number | null;
  decision?: { action: AgentAction; reason: string; signalId?: string } | null;
  toolCalls?: ToolCall[];
  flags?: string[];
}

export interface ScorecardSignal {
  signalId: string;
  label: string;
  kind: SignalKind;
  difficulty: "easy" | "medium" | "hard";
  status: SignalStatus;
  surfacedTurn: number | null;
  personaQuote: string | null;
  evidenceTurn: number | null;
  evidenceQuote: string | null;
  suggestedQuestion: string | null;
  note: string | null;
}

export interface ScorecardFeedback {
  turnIndex: number;
  type: Exclude<QuestionType, "good">;
  original: string;
  rewrite: string;
  principleId: string;
  principleName: string;
  impact: number;
}

export interface ScorecardFocus {
  skill: string;
  why: string;
  principleId: string | null;
}

export interface Scorecard {
  generatedAt: string;
  score: number | null;
  counts: { caught: number; partial: number; missed: number; unsure: number; not_surfaced: number; total: number };
  signals: ScorecardSignal[];
  feedback: ScorecardFeedback[];
  focus: ScorecardFocus[];
  summary: string;
}

export interface SelfCheckEntry {
  target: string;
  check: string;
  before: string;
  after: string;
}

export interface SessionView {
  id: string;
  guideId: string;
  guideTitle: string;
  guideContext: string;
  persona: { name: string; initial: string; tagline: string };
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  minQuestionsToScore: number;
  score: number | null;
  signalCount: number;
  signalsSurfaced: number;
  endProposed: boolean;
  turns: Turn[];
  scorecard: Scorecard | null;
  scorecardError: string | null;
  selfCheckLog: SelfCheckEntry[];
}

export interface SessionSummary {
  id: string;
  guideId: string;
  guideTitle: string;
  guideContext: string;
  personaName: string;
  personaInitial: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  questionCount: number;
  score: number | null;
  counts: Scorecard["counts"] | null;
  focus: ScorecardFocus[];
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
  | { event: "done"; data: { turn: Turn; questionCount: number; signalsSurfaced: number; signalCount: number; endProposed: boolean } }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } };
