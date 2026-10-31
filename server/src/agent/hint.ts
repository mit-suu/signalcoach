import type { AgentAction, QuestionType } from "../types/domain";

/**
 * In-session coaching hint sent with each `done` event. It never names or describes a signal
 * (FR-4): "dig" only says the last reply had something worth asking about, "open" is a generic
 * questioning tip. The client owns the wording.
 */
export type Hint = { kind: "dig" | "open" } | null;

/** Question types that earn the "ask about one specific time" tip when two come in a row. */
const WEAK_TYPES: ReadonlySet<QuestionType> = new Set(["leading", "closed", "vague", "future", "double", "bare_why"]);

interface HintTurn {
  index: number;
  role: "user" | "persona";
  questionType?: QuestionType | string | null;
  decision?: { action: AgentAction | string } | null;
  /** User turns: judge flags. Role-break / off-topic messages are not interview questions. */
  flags?: readonly string[] | null;
}

const NOT_A_QUESTION = new Set(["break_attempt", "off_topic"]);

/**
 * Hint for the persona reply at `replyIndex`, using only turns up to that reply (so an idempotent
 * replay gets the same hint). Dig wins: a reply that just planted a signal always gets "dig".
 * A reply that proposes ending gets none — the "sắp phải đi" notice is already showing.
 */
export function selectHint(turns: readonly HintTurn[], replyIndex: number): Hint {
  const upTo = turns.filter((t) => t.index <= replyIndex);
  const reply = upTo.find((t) => t.index === replyIndex);
  if (!reply || reply.role !== "persona") return null;
  if (reply.decision?.action === "propose_end") return null;
  if (reply.decision?.action === "plant_signal") return { kind: "dig" };

  const lastTwo = upTo.filter((t) => t.role === "user" && !t.flags?.some((f) => NOT_A_QUESTION.has(f))).slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((t) => t.questionType && WEAK_TYPES.has(t.questionType as QuestionType))) return { kind: "open" };
  return null;
}
