import type { Request, Response } from "express";
import { userId } from "../middleware/auth";
import * as sessions from "../services/session.service";
import { runTurn } from "../agent/turnRunner";
import { closeSignals } from "../agent/stateMachine";
import { generateScorecard } from "../agent/review";
import { openSse } from "../utils/sse";
import { MIN_QUESTIONS_TO_SCORE } from "../types/domain";
import { logger } from "../config/logger";
import type { SessionDoc } from "../models/session.model";
import type { Guide } from "../types/content";
import { conflict } from "../utils/errors";

type IdReq = Request<{ id: string }>;

/**
 * Browser-facing views. While a session is active, internal signal state, decisions and tool calls
 * never leave the server (a jailbreak via the API would otherwise reveal the answers). Once the
 * session has ended, the full agent log is exposed for the scorecard and the transcript review.
 */
function toSessionView(s: SessionDoc) {
  const guide = s.guide as Guide;
  const active = s.status === "active";
  const lastPersona = [...s.turns].reverse().find((t) => t.role === "persona");
  return {
    id: s.id as string,
    guideId: s.guideId,
    guideTitle: guide.title,
    guideContext: guide.context,
    persona: { name: guide.persona.name, initial: guide.persona.initial, tagline: guide.persona.tagline },
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    questionCount: s.questionCount,
    minQuestionsToScore: MIN_QUESTIONS_TO_SCORE,
    score: s.score ?? null,
    signalCount: s.signals.length,
    signalsSurfaced: s.signals.filter((x) => x.status !== "pending").length,
    endProposed: lastPersona?.decision?.action === "propose_end",
    turns: s.turns.map((t) =>
      active
        ? { index: t.index, role: t.role, text: t.text, createdAt: t.createdAt }
        : {
            index: t.index,
            role: t.role,
            text: t.text,
            createdAt: t.createdAt,
            questionType: t.questionType ?? null,
            judgeNote: t.judgeNote ?? null,
            signalId: t.signalId ?? null,
            layerDepth: t.layerDepth ?? null,
            decision: t.decision ?? null,
            toolCalls: t.toolCalls ?? [],
            flags: t.flags ?? [],
          },
    ),
    scorecard: active ? null : (s.scorecard ?? null),
    scorecardError: active ? null : (s.scorecardError ?? null),
    selfCheckLog: active ? [] : (s.selfCheckLog ?? []),
  };
}

export async function create(req: Request, res: Response) {
  const session = await sessions.createSession(userId(req), req.body.guideId);
  res.status(201).json({ session: toSessionView(session) });
}

export async function list(req: Request, res: Response) {
  const rows = await sessions.listSessions(userId(req));
  res.json({
    sessions: rows.map((s) => ({
      id: s._id.toHexString(),
      guideId: s.guideId,
      guideTitle: s.guide?.title ?? "",
      guideContext: s.guide?.context ?? "",
      personaName: s.guide?.persona?.name ?? "",
      personaInitial: s.guide?.persona?.initial ?? "?",
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt ?? null,
      questionCount: s.questionCount,
      score: s.score ?? null,
      counts: s.scorecard?.counts ?? null,
      focus: s.scorecard?.focus ?? [],
    })),
  });
}

export async function get(req: IdReq, res: Response) {
  const session = await sessions.getOwnedSession(userId(req), req.params.id);
  res.json({ session: toSessionView(session) });
}

export async function remove(req: IdReq, res: Response) {
  await sessions.deleteSession(userId(req), req.params.id);
  res.status(204).end();
}

export async function removeAll(req: Request, res: Response) {
  const deleted = await sessions.deleteAllSessions(userId(req));
  res.json({ deleted });
}

/** POST /sessions/:id/turns — Server-Sent Events: accepted → delta* → done | error */
export async function postTurn(req: IdReq, res: Response) {
  const session = await sessions.getActiveSession(userId(req), req.params.id);
  const sse = openSse(res);
  try {
    await runTurn(session, req.body, sse);
  } catch (err) {
    req.log.error({ err, sessionId: session.id }, "turn failed");
    sse.send("error", { code: "TURN_FAILED", message: "Có lỗi khi xử lý lượt này. Câu hỏi của bạn vẫn được giữ.", retryable: true });
  } finally {
    sse.close();
  }
}

/**
 * POST /sessions/:id/end — close the session, then run the review + self-check pass to build
 * the scorecard (FR-6). If the review model fails, the session stays ended with scorecardError
 * set and the client can retry via POST /sessions/:id/scorecard (S06b).
 */
export async function end(req: IdReq, res: Response) {
  const session = await sessions.getActiveSession(userId(req), req.params.id);
  const { signals, toolCalls } = closeSignals(session.signals.map((s) => ({ ...s.toObject?.() ?? s })) as Parameters<typeof closeSignals>[0]);
  session.signals = signals as typeof session.signals;
  session.markModified("signals");
  const tooShort = session.questionCount < MIN_QUESTIONS_TO_SCORE;
  const allSurfaced = session.signals.every((s) => s.status !== "not_surfaced");
  session.status = tooShort ? "insufficient" : allSurfaced ? "complete" : "incomplete";
  session.endedAt = new Date();
  const lastTurn = session.turns.at(-1);
  if (lastTurn) lastTurn.toolCalls.push({ name: "end_session", args: { reason: tooShort ? "too_short" : allSurfaced ? "complete" : "ended_early" }, ok: true }, ...toolCalls);
  await session.save();

  if (!tooShort) await buildScorecard(session, req);
  res.json({ session: toSessionView(session) });
}

/** POST /sessions/:id/scorecard — (re)build the scorecard of an ended session. */
export async function scorecard(req: IdReq, res: Response) {
  const session = await sessions.getOwnedSession(userId(req), req.params.id);
  if (session.status === "active") throw conflict("SESSION_ACTIVE", "Buổi luyện chưa kết thúc");
  if (session.status === "insufficient") throw conflict("SESSION_TOO_SHORT", "Buổi quá ngắn để chấm điểm");
  if (!session.scorecard) await buildScorecard(session, req);
  res.json({ session: toSessionView(session) });
}

async function buildScorecard(session: SessionDoc, req: Request) {
  try {
    const { scorecard, log } = await generateScorecard(session);
    session.scorecard = scorecard;
    session.selfCheckLog = log;
    session.score = scorecard.score;
    session.scorecardError = null;
    // The self-check may have revised a verdict; keep the signal state in step with the scorecard.
    for (const s of session.signals) {
      const final = scorecard.signals.find((x) => x.signalId === s.signalId);
      if (final) {
        s.status = final.status;
        s.evidenceTurn = final.evidenceTurn ?? undefined;
        s.evidenceQuote = final.evidenceQuote ?? undefined;
        s.suggestedQuestion = final.suggestedQuestion ?? undefined;
        s.note = final.note ?? undefined;
      }
    }
    session.markModified("signals");
    session.markModified("scorecard");
    session.markModified("selfCheckLog");
    (req.log ?? logger).info({ sessionId: session.id, score: scorecard.score, corrections: log.length }, "scorecard built");
  } catch (err) {
    (req.log ?? logger).error({ err: (err as Error).message, sessionId: session.id }, "scorecard failed");
    session.scorecardError = "Chưa tạo được bảng đánh giá. Hội thoại của bạn vẫn được lưu.";
  }
  await session.save();
}
