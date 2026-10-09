import { llm, LlmUnavailableError } from "../lib/llm";
import { llmRoles } from "../config/env";
import { logger } from "../config/logger";
import type { SessionDoc } from "../models/session.model";
import type { Guide } from "../types/content";
import type { SseStream } from "../utils/sse";
import { judgeTurn } from "./judge";
import { step, type SignalStateLike } from "./stateMachine";
import { buildPersonaMessages, cleanPersonaText } from "./personaPrompt";

/**
 * One interviewer turn — the session agent's loop ("LLM proposes, code decides"):
 *
 *   1. JUDGE          (LLM, JSON, Zod-validated)   → questionType, follow-up verdict, plant candidate
 *   2. STATE MACHINE  (pure code, unit-tested)     → decision {action, reason}, signal transitions,
 *                                                     tool calls; enforces the hard rules
 *   3. PERSONA        (LLM, streamed)              → in-character reply; only revealed layers in context
 *   4. PERSIST        (after every turn — NFR-3)   → turns, signal state, decision log
 *
 * State is only committed after the persona reply succeeds, so a failed call leaves the session
 * exactly where it was and the client can retry with the same clientMessageId.
 */
export async function runTurn(session: SessionDoc, input: { text: string; clientMessageId: string }, sse: SseStream): Promise<void> {
  const existing = session.turns.find((t) => t.role === "user" && t.clientMessageId === input.clientMessageId);

  // Idempotent retry: the reply was already produced — replay it instead of asking again.
  if (existing) {
    const reply = session.turns.find((t) => t.index === existing.index + 1);
    if (reply) {
      sse.send("accepted", { index: existing.index });
      sse.send("delta", { text: reply.text });
      sse.send("done", donePayload(session, reply.index));
      return;
    }
  }

  let userIndex = existing?.index;
  if (userIndex === undefined) {
    userIndex = session.turns.length;
    session.turns.push({ index: userIndex, role: "user", text: input.text, clientMessageId: input.clientMessageId, toolCalls: [], flags: [] });
    session.questionCount += 1;
    await session.save(); // the question survives even if the LLM call fails
  }
  sse.send("accepted", { index: userIndex });

  const guide = session.guide as Guide;
  const t0 = Date.now();

  // 1. JUDGE
  const { output: judge, degraded } = await judgeTurn(session, input.text);
  const tJudge = Date.now() - t0;

  // 2. STATE MACHINE
  const lastPersona = [...session.turns].reverse().find((t) => t.role === "persona");
  const { decision, signals } = step({
    guide,
    signals: session.signals.map(toStateLike),
    questionCount: session.questionCount,
    userTurnIndex: userIndex,
    question: input.text,
    judge,
    lastPersonaPlanted: Boolean(lastPersona?.signalId && lastPersona.layerDepth === 1),
    endProposed: session.flags.includes("end_proposed"),
  });
  if (degraded) decision.flags.push("judge_unavailable");

  // 3. PERSONA (streamed)
  const history = session.turns.map((t) => ({ role: t.role, text: t.text }));
  const messages = buildPersonaMessages(guide, history, decision, session.revealedFacts);
  let text = "";
  try {
    for await (const delta of llm.streamChat(messages, { ...llmRoles.persona, temperature: 0.8, maxTokens: 1024 })) {
      text += delta;
      if (!sse.closed) sse.send("delta", { text: delta });
    }
  } catch (err) {
    const retryable = err instanceof LlmUnavailableError || !(err as { status?: number }).status;
    logger.error({ err: (err as Error).message, sessionId: session.id }, "persona call failed");
    sse.send("error", { code: "LLM_UNAVAILABLE", message: `${guide.persona.name.split(" ").at(-1)} chưa trả lời được. Câu hỏi của bạn vẫn được giữ.`, retryable });
    return;
  }
  text = cleanPersonaText(text);
  if (!text) {
    sse.send("error", { code: "LLM_EMPTY", message: "Persona trả lời trống. Thử lại nhé.", retryable: true });
    return;
  }
  const tTotal = Date.now() - t0;

  // 4. PERSIST — commit judge result, decision, signal transitions, persona turn
  const userTurn = session.turns[userIndex]!;
  userTurn.questionType = decision.questionType;
  userTurn.judgeNote = judge.notes;
  userTurn.flags = decision.flags;

  const replyIndex = userIndex + 1;
  const revealed = decision.signalId && decision.revealLayer ? guide.signals.find((s) => s.id === decision.signalId)?.layers.find((l) => l.depth === decision.revealLayer) : undefined;
  session.turns.push({
    index: replyIndex,
    role: "persona",
    text,
    signalId: decision.signalId,
    layerDepth: decision.revealLayer,
    decision: { action: decision.action, reason: decision.reason, signalId: decision.signalId },
    toolCalls: decision.toolCalls,
    flags: [],
  });
  session.signals = signals as typeof session.signals;
  if (revealed) session.revealedFacts.push(revealed.reveal);
  for (const f of decision.flags) if (!session.flags.includes(f)) session.flags.push(f);
  session.markModified("signals");
  await session.save();

  logger.info({ sessionId: session.id, turn: replyIndex, action: decision.action, questionType: decision.questionType, signalId: decision.signalId, judgeMs: tJudge, totalMs: tTotal }, "turn");
  sse.send("done", donePayload(session, replyIndex));
}

function toStateLike(s: SessionDoc["signals"][number]): SignalStateLike {
  return {
    signalId: s.signalId,
    status: s.status as SignalStateLike["status"],
    layer: s.layer ?? 0,
    surfacedTurn: s.surfacedTurn ?? undefined,
    questionsSinceSeeded: s.questionsSinceSeeded ?? 0,
    evidenceTurn: s.evidenceTurn ?? undefined,
    evidenceQuote: s.evidenceQuote ?? undefined,
    confidence: s.confidence ?? undefined,
  };
}

/** What the browser may see mid-session: the reply text and progress counters, never signal state. */
function donePayload(session: SessionDoc, replyIndex: number) {
  const t = session.turns[replyIndex]!;
  return {
    turn: { index: t.index, role: t.role, text: t.text, createdAt: t.createdAt },
    questionCount: session.questionCount,
    signalsSurfaced: session.signals.filter((s) => s.status !== "pending").length,
    signalCount: session.signals.length,
    endProposed: t.decision?.action === "propose_end",
  };
}
