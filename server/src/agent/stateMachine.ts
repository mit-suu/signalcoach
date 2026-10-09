import {
  FOLLOW_UP_WINDOW,
  PLANT_DEADLINE_QUESTIONS,
  PROPOSE_END_MIN_QUESTIONS,
  UNSURE_CONFIDENCE,
  type AgentAction,
  type QuestionType,
  type ToolName,
} from "../types/domain";
import type { Guide, Signal } from "../types/content";
import type { JudgeOutput } from "./judge";

/**
 * STATE MACHINE — step 2 of every turn. Pure code, no I/O, unit-tested.
 * Takes the judge's proposal + the current signal state and returns the decision for this turn
 * plus the exact state transitions, enforcing the hard rules the LLM may not break:
 *   - at most one signal per persona reply, every signal eventually planted (FR-2)
 *   - a seeded signal is judged on the next FOLLOW_UP_WINDOW questions, then closed (FR-3)
 *   - low-confidence verdicts become "unsure", never a guess (FR-3)
 *   - double-barreled questions get a clarifying question before any judgment (FR-5)
 *   - "answer briefly" never withholds a signal (priority rule, §4.2)
 */

export interface SignalStateLike {
  signalId: string;
  status: "pending" | "seeded" | "caught" | "partial" | "missed" | "unsure" | "not_surfaced";
  layer: number;
  surfacedTurn?: number;
  questionsSinceSeeded: number;
  evidenceTurn?: number;
  evidenceQuote?: string;
  confidence?: number;
}

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  note?: string;
}

export interface Decision {
  action: AgentAction;
  reason: string;
  signalId?: string;
  /** Layer the persona may reveal this turn (plant → 1, go_deeper → next). */
  revealLayer?: number;
  brief: boolean;
  questionType: QuestionType;
  flags: string[];
  toolCalls: ToolCall[];
}

export interface StepInput {
  guide: Guide;
  signals: SignalStateLike[];
  questionCount: number; // including the question being answered
  userTurnIndex: number;
  question: string;
  judge: JudgeOutput;
  lastPersonaPlanted: boolean; // did the previous persona turn plant a signal?
  endProposed: boolean;
}

export interface StepResult {
  decision: Decision;
  signals: SignalStateLike[]; // updated copy
}

const byId = (guide: Guide) => new Map(guide.signals.map((s) => [s.id, s]));

/** Which pending signal to force when the deadline is hit: easy ones first, so hard ones land when the interviewer is warmed up. */
function pickForced(pending: SignalStateLike[], defs: Map<string, Signal>): SignalStateLike | undefined {
  const rank = { easy: 0, medium: 1, hard: 2 };
  return [...pending].sort((a, b) => rank[defs.get(a.signalId)!.difficulty] - rank[defs.get(b.signalId)!.difficulty])[0];
}

export function step(input: StepInput): StepResult {
  const defs = byId(input.guide);
  const signals = input.signals.map((s) => ({ ...s }));
  const toolCalls: ToolCall[] = [];
  const flags: string[] = [];
  const j = input.judge;
  const qt = j.questionType;
  const find = (id: string | null | undefined) => (id ? signals.find((s) => s.signalId === id) : undefined);

  if (j.breakAttempt) flags.push("break_attempt");
  if (j.offTopic) flags.push("off_topic");

  // ── Rule 1: double-barreled → clarify first; no judgment, windows don't advance ──
  if (qt === "double") {
    return {
      decision: {
        action: "clarify",
        reason: "Câu hỏi gộp hai ý — persona hỏi lại cho rõ trước khi trả lời (FR-5).",
        brief: false,
        questionType: qt,
        flags,
        toolCalls,
      },
      signals,
    };
  }

  // ── Rule 2: apply the follow-up verdict to the open signal it names ──
  const target = find(j.followUp.signalId);
  let revealLayer: number | undefined;
  let deeperSignal: SignalStateLike | undefined;
  if (target && j.followUp.verdict !== "none" && (target.status === "seeded" || target.status === "partial" || target.status === "caught")) {
    const conf = j.followUp.confidence;
    const def = defs.get(target.signalId)!;
    const windowOpen = target.questionsSinceSeeded < FOLLOW_UP_WINDOW;
    if ((target.status === "seeded" || target.status === "partial") && windowOpen) {
      let next: SignalStateLike["status"];
      if (conf < UNSURE_CONFIDENCE) next = "unsure";
      else if (j.followUp.verdict === "caught") next = "caught";
      else next = "partial";
      // Never downgrade partial → unsure on a later weak follow-up; the review pass revisits unsure anyway.
      if (!(target.status === "partial" && next === "unsure")) {
        toolCalls.push({
          name: "update_signal_status",
          args: { signalId: target.signalId, status: next, confidence: conf, evidenceTurn: input.userTurnIndex },
          ok: true,
          note: `${target.status} → ${next}`,
        });
        target.status = next;
        target.confidence = conf;
        target.evidenceTurn = input.userTurnIndex;
        target.evidenceQuote = j.followUp.evidence || input.question;
      }
    }
    // A real follow-up on a signal the persona already told unlocks the next layer (5-Whys ladder).
    if ((target.status === "caught" || target.status === "partial") && j.followUp.verdict === "caught" && conf >= UNSURE_CONFIDENCE && target.layer < def.layers.length) {
      deeperSignal = target;
      revealLayer = target.layer + 1;
    }
  }

  // ── Rule 3: advance the follow-up window of every seeded signal; close expired ones ──
  for (const s of signals) {
    if (s.status !== "seeded" && s.status !== "partial") continue;
    s.questionsSinceSeeded += 1;
    if (s.status === "seeded" && s.questionsSinceSeeded >= FOLLOW_UP_WINDOW) {
      toolCalls.push({ name: "update_signal_status", args: { signalId: s.signalId, status: "missed" }, ok: true, note: `cửa sổ ${FOLLOW_UP_WINDOW} câu đã hết` });
      s.status = "missed";
    }
  }

  // ── Rule 4: plant a signal? (judge proposes; deadline forces; one per reply) ──
  const pending = signals.filter((s) => s.status === "pending");
  let plant: SignalStateLike | undefined;
  let plantReason = "";
  const candidate = find(j.plantCandidate.signalId);
  if (candidate?.status === "pending" && !j.breakAttempt) {
    if (!input.lastPersonaPlanted || input.questionCount >= PLANT_DEADLINE_QUESTIONS) {
      plant = candidate;
      plantReason = j.plantCandidate.reason || "Câu hỏi mở đường cho chi tiết này.";
    } else {
      plantReason = ""; // spacing rule: don't plant two replies in a row early on — keeps drops natural
    }
  }
  if (!plant && pending.length && input.questionCount >= PLANT_DEADLINE_QUESTIONS && !j.breakAttempt) {
    plant = pickForced(pending, defs);
    plantReason = `Đã ${input.questionCount} câu hỏi mà còn ${pending.length} tín hiệu chưa kể — kể ngay để không bỏ sót (FR-2).`;
  }
  if (plant) {
    toolCalls.push({ name: "seed_signal", args: { signalId: plant.signalId, turn: input.userTurnIndex + 1 }, ok: true });
    plant.status = "seeded";
    plant.layer = 1;
    plant.surfacedTurn = input.userTurnIndex + 1;
    plant.questionsSinceSeeded = 0;
    // planting outranks going deeper on another signal (one signal's content per reply)
    deeperSignal = undefined;
    revealLayer = 1;
  } else if (deeperSignal && revealLayer) {
    toolCalls.push({ name: "reveal_layer", args: { signalId: deeperSignal.signalId, depth: revealLayer }, ok: true });
    deeperSignal.layer = revealLayer;
  }

  // ── Rule 5: choose the action ──
  const brief = qt === "leading" || qt === "closed" || qt === "future" || qt === "bare_why";
  let action: AgentAction;
  let reason: string;
  let signalId: string | undefined;

  const allOut = signals.every((s) => s.status !== "pending" && s.status !== "seeded");
  if (j.breakAttempt) {
    action = "stay_in_character";
    reason = "Người hỏi cố phá vai — persona ngơ ngác như người thật và quay lại chủ đề (FR-4).";
  } else if (plant) {
    action = "plant_signal";
    signalId = plant.signalId;
    reason = plantReason + (brief ? " Câu hỏi " + label(qt) + " nên kể ngắn, nhưng vẫn kể tín hiệu (quy tắc ưu tiên)." : "");
  } else if (deeperSignal) {
    action = "go_deeper";
    signalId = deeperSignal.signalId;
    reason = `Câu hỏi đào sâu đúng chi tiết "${defs.get(deeperSignal.signalId)!.label}" — persona mở lòng kể lớp ${revealLayer}.`;
  } else if (allOut && input.questionCount >= PROPOSE_END_MIN_QUESTIONS && !input.endProposed) {
    action = "propose_end";
    reason = "Mọi tín hiệu đã xuất hiện và cửa sổ hỏi tiếp đã đóng — persona gợi ý kết thúc.";
    flags.push("end_proposed");
    toolCalls.push({ name: "end_session", args: { reason: "all_signals_surfaced", proposedOnly: true }, ok: true });
  } else if (brief) {
    action = "answer_briefly";
    reason = `Câu hỏi ${label(qt)} — persona trả lời ngắn, không mở rộng (FR-5).`;
  } else if (qt === "vague") {
    action = "answer_briefly";
    reason = "Câu hỏi chung chung — persona trả lời chung chung như người thật.";
  } else {
    action = "answer";
    reason = j.followUp.verdict !== "none" && target ? "Câu hỏi tốt nhưng không còn lớp sâu hơn để kể." : "Câu hỏi bình thường — trả lời tự nhiên, chưa có tín hiệu nào hợp để kể.";
  }

  return {
    decision: { action, reason, signalId, revealLayer: plant || deeperSignal ? revealLayer : undefined, brief, questionType: qt, flags, toolCalls },
    signals,
  };
}

export function label(qt: QuestionType): string {
  const names: Record<QuestionType, string> = {
    good: "tốt",
    leading: "dẫn dắt",
    closed: "đóng",
    vague: "chung chung",
    double: "gộp hai ý",
    future: "giả định tương lai",
    bare_why: "\"tại sao\" trống",
    over_talking: "nói quá nhiều",
  };
  return names[qt];
}

/** Session-end transition: whatever is still pending was never reached; seeded-but-unjudged counts as missed. */
export function closeSignals(signals: SignalStateLike[]): { signals: SignalStateLike[]; toolCalls: ToolCall[] } {
  const out = signals.map((s) => ({ ...s }));
  const toolCalls: ToolCall[] = [];
  for (const s of out) {
    if (s.status === "pending") {
      s.status = "not_surfaced";
      toolCalls.push({ name: "update_signal_status", args: { signalId: s.signalId, status: "not_surfaced" }, ok: true, note: "buổi kết thúc trước khi persona kể" });
    } else if (s.status === "seeded") {
      s.status = "missed";
      toolCalls.push({ name: "update_signal_status", args: { signalId: s.signalId, status: "missed" }, ok: true, note: "buổi kết thúc khi cửa sổ hỏi tiếp còn mở" });
    }
  }
  return { signals: out, toolCalls };
}
