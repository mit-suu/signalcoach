import type { SignalKind } from "./domain";
import type { ScorecardFeedback, SelfCheckEntry } from "./scorecard";

/**
 * Self-checked analysis of a real interview transcript. No score: a real interview has no fixed
 * signal set, so only counts are shown. client/src/types/api.ts mirrors these shapes.
 */
export interface TranscriptTurn {
  index: number;
  speaker: string;
  text: string;
}

export type TranscriptSignalStatus = "caught" | "partial" | "missed";

export interface TranscriptSignal {
  /** Interviewee turn the signal was dropped in, and the verbatim quote from it. */
  turnIndex: number;
  quote: string;
  kind: SignalKind;
  label: string;
  status: TranscriptSignalStatus;
  /** "My" follow-up within the next FOLLOW_UP_WINDOW interviewer turns (caught/partial only). */
  followUpTurn: number | null;
  followUpQuote: string | null;
  /** What I could have asked (missed/partial only). */
  suggestedQuestion: string | null;
  note: string | null;
}

export interface TranscriptResult {
  generatedAt: string;
  counts: { caught: number; partial: number; missed: number; total: number };
  signals: TranscriptSignal[];
  feedback: ScorecardFeedback[];
  summary: string;
}

export interface TranscriptAnalysisOutput {
  result: TranscriptResult;
  log: SelfCheckEntry[];
}
