import type { QuestionType, SignalKind, SignalStatus } from "./domain";

/** Final, self-checked output of a session (FR-6, FR-9, FR-10). Stored on the session document. */
export interface ScorecardSignal {
  signalId: string;
  label: string;
  kind: SignalKind;
  difficulty: "easy" | "medium" | "hard";
  status: Exclude<SignalStatus, "pending" | "seeded">;
  /** What the persona said when the signal was dropped (persona turn index + quote). */
  surfacedTurn: number | null;
  personaQuote: string | null;
  /** The interviewer's follow-up used as evidence for caught/partial (user turn index + quote). */
  evidenceTurn: number | null;
  evidenceQuote: string | null;
  /** A question the interviewer could have asked (missed/partial/unsure only). */
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
  /** 1–3, how much this mistake cost in signal terms; the top 3 are highlighted. */
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

/** One line per thing the self-check pass changed or dropped (FR-6: "log before/after"). */
export interface SelfCheckEntry {
  target: string;
  check: string;
  before: string;
  after: string;
}
