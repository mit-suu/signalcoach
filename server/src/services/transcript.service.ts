import { Types } from "mongoose";
import { TranscriptModel } from "../models/transcript.model";
import { parseTranscript, resolveSpeaker } from "../agent/transcriptParser";
import { analyzeTranscript } from "../agent/transcriptAnalyzer";
import { LlmUnavailableError } from "../lib/llm";
import { logger } from "../config/logger";
import { listSampleTranscripts } from "./content.service";
import type { SelfCheckEntry } from "../types/scorecard";
import type { TranscriptResult, TranscriptTurn } from "../types/transcript";
import { AppError, notFound } from "../utils/errors";

/** Fewer questions than this by "me" → nothing worth analysing. */
export const MIN_MY_TURNS = 4;

const oid = (id: string) => new Types.ObjectId(id);

const FORMAT_HINT = "Mỗi lượt nói một dòng, bắt đầu bằng tên người nói và dấu hai chấm, ví dụ:\nMinh: Kể mình nghe lần gần nhất chị…\nLan: Hôm đó mình…";

export interface AnalysisView {
  id: string;
  title: string;
  me: string;
  createdAt: string;
  turns: TranscriptTurn[];
  result: TranscriptResult;
  selfCheckLog: SelfCheckEntry[];
}

export interface AnalysisSummary {
  id: string;
  title: string;
  me: string;
  createdAt: string;
  turnCount: number;
  counts: TranscriptResult["counts"];
  feedbackCount: number;
}

type Stored = { _id: Types.ObjectId; title: string; me: string; createdAt: Date; turns: TranscriptTurn[]; result: TranscriptResult; selfCheckLog?: SelfCheckEntry[] };

const toView = (d: Stored): AnalysisView => ({
  id: d._id.toHexString(),
  title: d.title,
  me: d.me,
  createdAt: d.createdAt.toISOString(),
  turns: d.turns,
  result: d.result,
  selfCheckLog: d.selfCheckLog ?? [],
});

export function listSamples() {
  return listSampleTranscripts().map(({ id, title, description, me, text }) => ({ id, title, description, me, text }));
}

function defaultTitle(turns: TranscriptTurn[], me: string, now: Date): string {
  const other = turns.find((t) => t.speaker !== me)?.speaker ?? "";
  const date = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
  return `Phỏng vấn ${other} · ${date}`;
}

/**
 * Parse (code, no LLM) → validate → analyse (LLM + self-check) → save. Parse and validation errors
 * are 400s before any model call; a model failure is a retryable 503 and nothing is saved.
 */
export async function createAnalysis(userId: string, input: { text: string; me: string; title?: string }): Promise<AnalysisView> {
  const { turns, speakers } = parseTranscript(input.text);
  if (speakers.length < 2) {
    throw new AppError(400, "TRANSCRIPT_UNPARSEABLE", `Không nhận ra được ít nhất hai người nói trong bản ghi. ${FORMAT_HINT}`, { hint: FORMAT_HINT, speakers });
  }
  const me = resolveSpeaker(speakers, input.me);
  if (!me) {
    throw new AppError(400, "VALIDATION_ERROR", `Không có người nói "${input.me}" trong bản ghi. Chọn một trong: ${speakers.join(", ")}.`, { speakers });
  }
  const myTurns = turns.filter((t) => t.speaker === me).length;
  if (myTurns < MIN_MY_TURNS) {
    throw new AppError(400, "TRANSCRIPT_TOO_SHORT", `Bản ghi cần ít nhất ${MIN_MY_TURNS} lượt hỏi của ${me} để phân tích (hiện có ${myTurns}).`, { myTurns, min: MIN_MY_TURNS });
  }

  let analysis;
  try {
    analysis = await analyzeTranscript(turns, me);
  } catch (err) {
    // Name/flag only — messages can carry model output, which quotes the transcript.
    logger.error({ errName: (err as Error).name, unavailable: err instanceof LlmUnavailableError, turns: turns.length }, "transcript analysis failed");
    throw new AppError(503, err instanceof LlmUnavailableError ? "LLM_UNAVAILABLE" : "ANALYSIS_FAILED", "Chưa phân tích được bản ghi lúc này. Bản ghi của bạn chưa bị lưu — hãy thử lại.", { retryable: true });
  }

  const now = new Date();
  const doc = await TranscriptModel.create({
    ownerId: oid(userId),
    title: input.title?.trim() || defaultTitle(turns, me, now),
    me,
    turns,
    result: analysis.result,
    selfCheckLog: analysis.log,
  });
  return toView(doc.toObject() as unknown as Stored);
}

export async function listAnalyses(userId: string): Promise<AnalysisSummary[]> {
  const rows = await TranscriptModel.find({ ownerId: oid(userId) })
    .sort({ createdAt: -1 })
    .select({ title: 1, me: 1, createdAt: 1, "result.counts": 1, "result.feedback.turnIndex": 1, "turns.index": 1 })
    .lean<Pick<Stored, "_id" | "title" | "me" | "createdAt" | "turns" | "result">[]>();
  return rows.map((r) => ({
    id: r._id.toHexString(),
    title: r.title,
    me: r.me,
    createdAt: r.createdAt.toISOString(),
    turnCount: r.turns?.length ?? 0,
    counts: r.result?.counts ?? { caught: 0, partial: 0, missed: 0, total: 0 },
    feedbackCount: r.result?.feedback?.length ?? 0,
  }));
}

export async function getAnalysis(userId: string, id: string): Promise<AnalysisView> {
  if (!Types.ObjectId.isValid(id)) throw notFound("Analysis");
  const doc = await TranscriptModel.findOne({ _id: oid(id), ownerId: oid(userId) }).lean<Stored>();
  if (!doc) throw notFound("Analysis");
  return toView(doc);
}

export async function deleteAnalysis(userId: string, id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) throw notFound("Analysis");
  const { deletedCount } = await TranscriptModel.deleteOne({ _id: oid(id), ownerId: oid(userId) });
  if (!deletedCount) throw notFound("Analysis");
}

export async function deleteAllAnalyses(userId: string): Promise<number> {
  const { deletedCount } = await TranscriptModel.deleteMany({ ownerId: oid(userId) });
  return deletedCount;
}

/** Login: analyses made anonymously in this browser move onto the account, like sessions. */
export async function moveAnalyses(fromUserId: string, toUserId: Types.ObjectId): Promise<void> {
  await TranscriptModel.updateMany({ ownerId: oid(fromUserId) }, { $set: { ownerId: toUserId } });
}
