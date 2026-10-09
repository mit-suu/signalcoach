import { Types } from "mongoose";
import { SessionModel, type SessionDoc } from "../models/session.model";
import { resolveGuide } from "./guide.service";
import { notFound, conflict } from "../utils/errors";

const oid = (id: string) => new Types.ObjectId(id);

export async function createSession(userId: string, guideId: string): Promise<SessionDoc> {
  const { guide } = await resolveGuide(userId, guideId);
  return SessionModel.create({
    userId: oid(userId),
    guideId: guide.id,
    guide, // snapshot — the session is self-contained from here on
    turns: [{ index: 0, role: "persona", text: guide.persona.openingMessage, toolCalls: [], flags: [] }],
    signals: guide.signals.map((s) => ({ signalId: s.id })),
  });
}

/** Every lookup is scoped by owner — another user's id simply 404s (NFR-2). */
export async function getOwnedSession(userId: string, sessionId: string): Promise<SessionDoc> {
  if (!Types.ObjectId.isValid(sessionId)) throw notFound("Session");
  const session = await SessionModel.findOne({ _id: oid(sessionId), userId: oid(userId) });
  if (!session) throw notFound("Session");
  return session;
}

export async function getActiveSession(userId: string, sessionId: string): Promise<SessionDoc> {
  const session = await getOwnedSession(userId, sessionId);
  if (session.status !== "active") throw conflict("SESSION_ENDED", "Buổi luyện này đã kết thúc");
  return session;
}

export interface SessionListRow {
  _id: Types.ObjectId;
  guideId: string;
  status: string;
  startedAt: Date;
  endedAt?: Date | null;
  questionCount: number;
  score: number | null;
  guide: { title: string; context: string; persona: { name: string; initial: string } };
  scorecard: { focus?: { skill: string; principleId: string | null }[]; counts?: Record<string, number> } | null;
}

export async function listSessions(userId: string): Promise<SessionListRow[]> {
  return SessionModel.find({ userId: oid(userId) })
    .sort({ startedAt: -1 })
    .select({
      guideId: 1,
      status: 1,
      startedAt: 1,
      endedAt: 1,
      questionCount: 1,
      score: 1,
      "guide.title": 1,
      "guide.context": 1,
      "guide.persona.name": 1,
      "guide.persona.initial": 1,
      "scorecard.focus": 1,
      "scorecard.counts": 1,
    })
    .lean<SessionListRow[]>();
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  if (!Types.ObjectId.isValid(sessionId)) throw notFound("Session");
  const { deletedCount } = await SessionModel.deleteOne({ _id: oid(sessionId), userId: oid(userId) });
  if (!deletedCount) throw notFound("Session");
}

export async function deleteAllSessions(userId: string): Promise<number> {
  const { deletedCount } = await SessionModel.deleteMany({ userId: oid(userId) });
  return deletedCount;
}
