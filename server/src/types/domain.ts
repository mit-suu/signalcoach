/**
 * Domain enums shared by models, agent and API responses.
 * Names follow the design data model (Design/SignalCoach MVP -VI-, section 5).
 * client/src/types/api.ts mirrors the parts the UI needs — keep them in step.
 */
export const SESSION_STATUSES = ["active", "complete", "incomplete", "insufficient"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const TURN_ROLES = ["user", "persona"] as const;
export type TurnRole = (typeof TURN_ROLES)[number];

/** pending/seeded are internal; the scorecard shows the remaining five. */
export const SIGNAL_STATUSES = ["pending", "seeded", "caught", "partial", "missed", "unsure", "not_surfaced"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_KINDS = ["emotion", "trailing", "contradiction", "behavior"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const QUESTION_TYPES = ["good", "leading", "closed", "vague", "double", "future", "bare_why", "over_talking"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const AGENT_ACTIONS = ["answer", "plant_signal", "go_deeper", "answer_briefly", "clarify", "propose_end", "stay_in_character"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

/** Tools the agent calls; every call is validated in code and logged on the turn (FR-5 "every decision has a reason"). */
export const TOOL_NAMES = ["seed_signal", "update_signal_status", "reveal_layer", "end_session", "lookup_interview_principle"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const SESSION_FLAGS = ["break_attempt", "end_proposed", "off_topic", "contradiction"] as const;
export type SessionFlag = (typeof SESSION_FLAGS)[number];

/** PRD FR-4: fewer interviewer questions than this → "not enough data to score". */
export const MIN_QUESTIONS_TO_SCORE = 6;
/** FR-3: a seeded signal is judged on the user's next N questions, then closed. */
export const FOLLOW_UP_WINDOW = 2;
/** Addendum: judgments below this confidence are recorded as unsure instead of guessed. */
export const UNSURE_CONFIDENCE = 0.6;
/** From this many questions on, the agent plants a pending signal every turn so none is left out (FR-2). */
export const PLANT_DEADLINE_QUESTIONS = 8;
/** The persona only proposes ending after this many questions, and only once all signals are out. */
export const PROPOSE_END_MIN_QUESTIONS = 8;
