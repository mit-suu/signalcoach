/**
 * Seed demo practice history for one registered account, so /history (progress chart) and the
 * scorecards have something to show without spending LLM calls.
 *   npx tsx --env-file=.env scripts/seed-demo-history.ts <email>          (replace previous demo sessions)
 *   npx tsx --env-file=.env scripts/seed-demo-history.ts <email> --clean  (only remove them)
 * Every seeded session carries flags: ["demo_seed"]; real sessions are never touched.
 */
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/config/db";
import { SessionModel } from "../src/models/session.model";
import { UserModel } from "../src/models/user.model";
import { getGuide, loadContent, lookupPrinciple } from "../src/services/content.service";
import { computeScore, countStatuses } from "../src/agent/scoring";
import type { Guide } from "../src/types/content";
import type { QuestionType, SignalStatus } from "../src/types/domain";
import type { Scorecard, ScorecardFeedback, ScorecardSignal } from "../src/types/scorecard";

const DEMO_FLAG = "demo_seed";
type Mistake = Exclude<QuestionType, "good">;
type FinalStatus = Exclude<SignalStatus, "pending" | "seeded">;

/** Example questions per type (generic enough for every guide). */
const QUESTIONS: Record<QuestionType, string[]> = {
  good: [
    "Lần gần nhất chuyện đó xảy ra là khi nào, kể mình nghe với?",
    "Lúc đó cụ thể bạn đã làm gì?",
    "Chuyện gì xảy ra ngay sau đó?",
    "Bạn nói \"mà thôi\" — lúc đó có chuyện gì vậy?",
    "Ai khác cũng liên quan tới chuyện này?",
    "Bạn có thể kể lại từng bước hôm đó không?",
  ],
  leading: ["Bạn thấy tính năng nhắc nhở hữu ích đúng không?", "Chắc là do app khó dùng nên bạn bỏ phải không?", "Bạn cũng thấy nhập tay mất thời gian nhỉ?"],
  closed: ["Bạn có dùng app nào không?", "Bạn có thích cách làm hiện tại không?", "Việc đó có khó không?"],
  vague: ["Bạn thấy thế nào về chuyện đó?", "Nói chung bạn quản lý ra sao?"],
  double: ["Bạn theo dõi thế nào và thích điều gì ở cách đó?"],
  future: ["Nếu có tính năng tự động thì bạn có dùng không?"],
  bare_why: ["Tại sao?"],
  over_talking: ["Mình nghĩ là nhiều người cũng gặp vấn đề này, ví dụ như mình hồi trước cũng hay quên, rồi mình thử đủ kiểu, nên bạn thấy sao?"],
};

const PERSONA_REPLIES = [
  "Ừm, cũng bình thường thôi.",
  "Để mình nhớ lại… chắc tầm tháng trước.",
  "Thật ra thì cũng không hẳn vậy.",
  "Mình cũng không để ý lắm.",
  "Hôm đó bận quá nên mình bỏ qua luôn.",
];

interface Plan {
  guideId: string;
  daysAgo: number;
  status: "complete" | "incomplete";
  mistakes: Mistake[];
  goodQuestions: number;
  signals: FinalStatus[];
}

/** Oldest first: scores rise and mistakes thin out, with one early-ended session in the middle. */
const PLANS: Plan[] = [
  { guideId: "budgeting-app", daysAgo: 21, status: "complete", mistakes: ["leading", "leading", "closed", "closed", "vague", "future"], goodQuestions: 4, signals: ["caught", "partial", "missed", "missed", "missed", "not_surfaced"] },
  { guideId: "fitness-app", daysAgo: 18, status: "complete", mistakes: ["leading", "leading", "closed", "double", "bare_why"], goodQuestions: 5, signals: ["caught", "caught", "partial", "missed", "missed", "missed"] },
  { guideId: "project-tool", daysAgo: 16, status: "incomplete", mistakes: ["closed", "leading", "vague"], goodQuestions: 1, signals: ["partial", "missed", "not_surfaced", "not_surfaced", "not_surfaced", "not_surfaced"] },
  { guideId: "budgeting-app", daysAgo: 13, status: "complete", mistakes: ["leading", "closed", "vague", "double"], goodQuestions: 6, signals: ["caught", "caught", "partial", "partial", "missed", "missed"] },
  { guideId: "fitness-app", daysAgo: 10, status: "complete", mistakes: ["leading", "closed", "future"], goodQuestions: 7, signals: ["caught", "caught", "caught", "partial", "missed", "missed"] },
  { guideId: "project-tool", daysAgo: 7, status: "complete", mistakes: ["closed", "vague"], goodQuestions: 8, signals: ["caught", "caught", "caught", "partial", "partial", "missed"] },
  { guideId: "budgeting-app", daysAgo: 4, status: "complete", mistakes: ["leading"], goodQuestions: 8, signals: ["caught", "caught", "caught", "caught", "partial", "missed"] },
  { guideId: "fitness-app", daysAgo: 1, status: "complete", mistakes: ["closed"], goodQuestions: 9, signals: ["caught", "caught", "caught", "caught", "caught", "partial"] },
];

function buildSession(userId: mongoose.Types.ObjectId, plan: Plan, seed: number) {
  const guide: Guide = getGuide(plan.guideId);
  const startedAt = new Date(Date.now() - plan.daysAgo * 86_400_000 - seed * 3_600_000);

  // Interleave mistakes among good questions so they don't all bunch at the start.
  const kinds: QuestionType[] = Array<QuestionType>(plan.goodQuestions).fill("good");
  plan.mistakes.forEach((m, i) => kinds.splice(Math.min(kinds.length, i * 2 + 1), 0, m));

  const turns: Record<string, unknown>[] = [{ index: 0, role: "persona", text: guide.persona.openingMessage, createdAt: startedAt }];
  const used: Partial<Record<QuestionType, number>> = {};
  for (const qt of kinds) {
    const pool = QUESTIONS[qt];
    const text = pool[(used[qt] = (used[qt] ?? -1) + 1) % pool.length]!;
    const at = (n: number) => new Date(startedAt.getTime() + n * 40_000);
    turns.push({ index: turns.length, role: "user", text, questionType: qt, createdAt: at(turns.length) });
    turns.push({ index: turns.length, role: "persona", text: PERSONA_REPLIES[turns.length % PERSONA_REPLIES.length]!, createdAt: at(turns.length) });
  }

  // Plant each surfaced signal in a persona turn; caught/partial cite the next user turn as evidence.
  const personaTurns = turns.filter((t) => t.role === "persona" && t.index !== 0);
  const signals: ScorecardSignal[] = guide.signals.map((def, i) => {
    const status = plan.signals[i] ?? "not_surfaced";
    const surfaced = status === "not_surfaced" ? undefined : personaTurns[Math.min(i * 2, personaTurns.length - 1)];
    if (surfaced) surfaced.text = def.layers[0]!.reveal;
    const evidence = surfaced && (status === "caught" || status === "partial") ? turns[(surfaced.index as number) + 1] : undefined;
    return {
      signalId: def.id,
      label: def.label,
      kind: def.kind,
      difficulty: def.difficulty,
      status,
      surfacedTurn: surfaced ? (surfaced.index as number) : null,
      personaQuote: surfaced ? def.layers[0]!.reveal : null,
      evidenceTurn: evidence ? (evidence.index as number) : null,
      evidenceQuote: evidence ? (evidence.text as string) : null,
      suggestedQuestion: status === "caught" ? null : `Hỏi tiếp: ${def.layers[0]!.unlockIntent}`,
      note: null,
    };
  });

  const counts = countStatuses(signals.map((s) => s.status));
  const score = plan.status === "complete" ? computeScore(counts) : null;
  const feedback: ScorecardFeedback[] = turns
    .filter((t) => t.role === "user" && t.questionType !== "good")
    .slice(0, 8)
    .flatMap((t) => {
      const type = t.questionType as Mistake;
      const p = lookupPrinciple(type);
      if (!p) return [];
      return [{ turnIndex: t.index as number, type, original: t.text as string, rewrite: p.goodExample, principleId: p.id, principleName: p.name, impact: type === "leading" || type === "closed" ? 3 : 2 }];
    });
  const top = feedback[0];
  const scorecard: Scorecard = {
    generatedAt: new Date(startedAt.getTime() + 20 * 60_000).toISOString(),
    score,
    counts,
    signals,
    feedback,
    focus: top ? [{ skill: top.principleName, why: `Buổi này có ${plan.mistakes.length} câu hỏi chưa tốt, nhiều nhất là loại "${top.type}".`, principleId: top.principleId }] : [],
    summary: `Dữ liệu demo: bắt được ${counts.caught}/${counts.total} tín hiệu, ${plan.mistakes.length} câu hỏi cần sửa.`,
  };

  return {
    userId,
    guideId: guide.id,
    guide,
    status: plan.status,
    startedAt,
    endedAt: new Date(startedAt.getTime() + 18 * 60_000),
    questionCount: kinds.length,
    score,
    turns,
    signals: signals.map((s) => ({ signalId: s.signalId, status: s.status, layer: s.status === "not_surfaced" ? 0 : 1, surfacedTurn: s.surfacedTurn ?? undefined, evidenceTurn: s.evidenceTurn ?? undefined, evidenceQuote: s.evidenceQuote ?? undefined })),
    revealedFacts: [],
    flags: [DEMO_FLAG],
    scorecard,
    selfCheckLog: [],
  };
}

async function main() {
  const [email, mode] = process.argv.slice(2);
  if (!email) throw new Error("Usage: seed-demo-history.ts <email> [--clean]");
  loadContent();
  await connectDb();
  try {
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) throw new Error(`No registered account with email ${email}`);
    const removed = await SessionModel.deleteMany({ userId: user._id, flags: DEMO_FLAG });
    console.log(`Removed ${removed.deletedCount} previous demo session(s) for ${email}.`);
    if (mode === "--clean") return;
    const docs = PLANS.map((p, i) => buildSession(user._id, p, i));
    await SessionModel.insertMany(docs);
    console.log(`Inserted ${docs.length} demo sessions. Scores: ${docs.map((d) => (d.score === null ? "—" : Math.round(d.score * 100))).join(", ")}`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
