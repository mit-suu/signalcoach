import { z } from "zod";
import { llm, type ChatMessage } from "../lib/llm";
import { llmRoles } from "../config/env";
import { logger } from "../config/logger";
import type { SessionDoc } from "../models/session.model";
import type { Guide } from "../types/content";
import type { Scorecard, ScorecardFeedback, ScorecardFocus, ScorecardSignal, SelfCheckEntry } from "../types/scorecard";
import { FOLLOW_UP_WINDOW, QUESTION_TYPES, type QuestionType } from "../types/domain";
import { listPrinciples, lookupPrinciple } from "../services/content.service";
import { extractJson } from "./judge";
import { computeScore, countStatuses } from "./scoring";

/**
 * REVIEW + SELF-CHECK — runs once when a session ends (FR-6, FR-9, FR-10).
 *
 *   1. The review model re-reads the whole transcript and proposes: a final status + evidence per
 *      signal (revisiting "unsure"), a suggested question per missed/partial signal, question-quality
 *      feedback, and 1–3 focus areas.
 *   2. Code self-checks every claim against the transcript — quotes must exist, evidence must fall in
 *      the follow-up window, every feedback item must map to a library principle (tool lookup), suggested
 *      questions must not repeat what was asked — and logs every correction (before/after).
 */
const ReviewSchema = z.object({
  signals: z
    .array(
      z.object({
        signalId: z.string(),
        status: z.enum(["caught", "partial", "missed", "unsure", "not_surfaced"]),
        evidenceTurn: z.number().int().nullable().default(null),
        evidenceQuote: z.string().default(""),
        suggestedQuestion: z.string().default(""),
        note: z.string().default(""),
      }),
    )
    .default([]),
  feedback: z
    .array(
      z.object({
        turnIndex: z.number().int(),
        type: z.enum(QUESTION_TYPES),
        rewrite: z.string().default(""),
        impact: z.number().min(1).max(3).default(1),
      }),
    )
    .default([]),
  focus: z.array(z.object({ skill: z.string(), why: z.string().default(""), principleId: z.string().nullable().default(null) })).default([]),
  summary: z.string().default(""),
});
type ReviewOutput = z.infer<typeof ReviewSchema>;

const REVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signalId: { type: "string" },
          status: { type: "string", enum: ["caught", "partial", "missed", "unsure", "not_surfaced"] },
          evidenceTurn: { type: "integer", nullable: true },
          evidenceQuote: { type: "string" },
          suggestedQuestion: { type: "string" },
          note: { type: "string" },
        },
        required: ["signalId", "status", "evidenceTurn", "evidenceQuote", "suggestedQuestion", "note"],
      },
    },
    feedback: {
      type: "array",
      items: {
        type: "object",
        properties: {
          turnIndex: { type: "integer" },
          type: { type: "string", enum: [...QUESTION_TYPES] },
          rewrite: { type: "string" },
          impact: { type: "integer" },
        },
        required: ["turnIndex", "type", "rewrite", "impact"],
      },
    },
    focus: {
      type: "array",
      items: {
        type: "object",
        properties: { skill: { type: "string" }, why: { type: "string" }, principleId: { type: "string", nullable: true } },
        required: ["skill", "why", "principleId"],
      },
    },
    summary: { type: "string" },
  },
  required: ["signals", "feedback", "focus", "summary"],
};

export function buildReviewMessages(session: SessionDoc): ChatMessage[] {
  const guide = session.guide as Guide;
  const defs = new Map(guide.signals.map((s) => [s.id, s]));
  const principles = listPrinciples();
  const questions = session.turns.filter((t) => t.role === "user").map((t) => ({ index: t.index, text: t.text, questionType: t.questionType ?? null }));
  const stateJson = JSON.stringify({
    signals: session.signals.map((s) => ({ signalId: s.signalId, status: s.status, surfacedTurn: s.surfacedTurn ?? null, evidenceTurn: s.evidenceTurn ?? null, evidenceQuote: s.evidenceQuote ?? "" })),
    questions,
  });

  const system = [
    "TASK=review",
    "Bạn là huấn luyện viên phỏng vấn người dùng, rà lại toàn bộ một buổi luyện tập trước khi lập bảng đánh giá. Người luyện (interviewer) đã phỏng vấn persona AI; persona cố tình thả các tín hiệu đáng hỏi sâu.",
    "Nhiệm vụ của bạn: đọc toàn bộ hội thoại, đối chiếu với trạng thái tạm mà hệ thống ghi trong buổi, rồi trả về JSON.",
    "",
    "1) signals — với MỖI tín hiệu trong danh sách:",
    "- not_surfaced: persona chưa kịp kể (giữ nguyên, không đổi).",
    "- caught: interviewer đã hỏi tiếp đúng vào chi tiết đó trong vòng " + FOLLOW_UP_WINDOW + " câu hỏi kế tiếp sau lượt persona kể. evidenceTurn = chỉ số lượt câu hỏi đó, evidenceQuote = trích NGUYÊN VĂN một đoạn trong câu hỏi đó.",
    "- partial: có chạm tới nhưng không mời kể thêm / chuyển hướng ngay. Cũng cần evidence.",
    "- missed: không hỏi tiếp trong cửa sổ đó.",
    "- unsure: bạn thật sự không chắc (ví dụ câu hỏi quá mơ hồ). Chỉ dùng khi cần; hãy cố gắng kết luận các trường hợp hệ thống đang để unsure.",
    "- suggestedQuestion: với tín hiệu không phải caught, một câu hỏi interviewer ĐÁNG LẼ nên hỏi, nhắc tới đúng chi tiết persona đã nói trong buổi này, KHÔNG trùng với câu nào interviewer đã hỏi. Để trống nếu caught hoặc not_surfaced.",
    "",
    "2) feedback — những câu hỏi nên viết lại. Mỗi mục: turnIndex (lượt câu hỏi), type (leading|closed|vague|double|future|bare_why|over_talking — không dùng good), rewrite (cách hỏi tốt hơn, cùng ý), impact 1–3 (3 = khiến bỏ lỡ tín hiệu). Chỉ đưa lỗi thật, tối đa 8 mục. Buổi không có lỗi thì để mảng rỗng.",
    "",
    "3) focus — 1 đến 3 trọng tâm cho buổi sau: skill (ngắn, như tên kỹ năng), why (một câu, dẫn chứng từ buổi này), principleId (mã P.. từ thư viện nếu có nguyên tắc phù hợp, không thì null).",
    "4) summary — một câu nhận xét tổng thể, thân thiện.",
    "Viết tiếng Việt. Trích dẫn phải nguyên văn.",
  ].join("\n");

  const signalLines = session.signals.map((s) => {
    const def = defs.get(s.signalId)!;
    const personaTurn = s.surfacedTurn !== undefined && s.surfacedTurn !== null ? session.turns[s.surfacedTurn] : undefined;
    return [
      `- ${s.signalId} "${def.label}" (${def.kind}, ${def.difficulty})`,
      `  trạng thái tạm: ${s.status}${s.surfacedTurn != null ? `, persona kể ở lượt #${s.surfacedTurn}` : ""}${s.evidenceTurn != null ? `, bằng chứng tạm: lượt #${s.evidenceTurn} "${s.evidenceQuote ?? ""}"` : ""}`,
      personaTurn ? `  persona đã nói: "${personaTurn.text}"` : "  persona chưa kể.",
      `  kiểu hỏi tiếp mong đợi: ${def.layers[0]!.unlockIntent}`,
    ].join("\n");
  });

  const user = [
    `Chủ đề: ${guide.goal}`,
    `Persona: ${guide.persona.name}, ${guide.persona.age} — ${guide.persona.background}`,
    "",
    "Thư viện nguyên tắc (id — tên):",
    ...principles.map((p) => `- ${p.id} — ${p.name}: ${p.summary}`),
    "",
    "Tín hiệu:",
    ...signalLines,
    "",
    "Hội thoại đầy đủ (lượt # — người nói — nội dung; [loại câu hỏi] do hệ thống gán tạm):",
    ...session.turns.map((t) => `#${t.index} ${t.role === "user" ? "Interviewer" : guide.persona.name}${t.questionType ? ` [${t.questionType}]` : ""}: ${t.text}`),
    "",
    `STATE_JSON=${stateJson}`,
    "",
    "Trả về JSON đúng schema.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function generateScorecard(session: SessionDoc): Promise<{ scorecard: Scorecard; log: SelfCheckEntry[] }> {
  const messages = buildReviewMessages(session);
  let review: ReviewOutput | null = null;
  let lastIssue = "";
  for (let attempt = 0; attempt < 2 && !review; attempt++) {
    const raw = await llm.completeJson(messages, { ...llmRoles.review, maxTokens: 8192, jsonSchema: REVIEW_JSON_SCHEMA });
    const parsed = ReviewSchema.safeParse(JSON.parse(extractJson(raw)));
    if (parsed.success) review = parsed.data;
    else {
      lastIssue = z.prettifyError(parsed.error);
      logger.warn({ attempt, issue: lastIssue.slice(0, 300) }, "review output rejected by schema");
    }
  }
  if (!review) throw new Error(`review output invalid: ${lastIssue}`);
  return selfCheck(session, review);
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-check (pure, deterministic) — every claim is verified against the transcript
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[“”"'’`.,;:!?()\-–—…]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1));
function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
const quoteIn = (quote: string, text: string) => Boolean(quote.trim()) && norm(text).includes(norm(quote));

export function selfCheck(session: SessionDoc, review: ReviewOutput): { scorecard: Scorecard; log: SelfCheckEntry[] } {
  const guide = session.guide as Guide;
  const log: SelfCheckEntry[] = [];
  const turns = session.turns;
  const userTurns = turns.filter((t) => t.role === "user");
  const askedTexts = userTurns.map((t) => t.text);
  const reviewed = new Map(review.signals.map((s) => [s.signalId, s]));

  // Which user turns count as the follow-up window after a persona turn (next N questions).
  const windowAfter = (personaTurn: number) => userTurns.filter((t) => t.index > personaTurn).slice(0, FOLLOW_UP_WINDOW).map((t) => t.index);

  const signals: ScorecardSignal[] = session.signals.map((state) => {
    const def = guide.signals.find((s) => s.id === state.signalId)!;
    const r = reviewed.get(state.signalId);
    const surfacedTurn = state.surfacedTurn ?? null;
    const personaQuote = surfacedTurn !== null ? (turns[surfacedTurn]?.text ?? null) : null;
    const target = `signal:${state.signalId}`;

    // Base: the status the state machine recorded during the session.
    let status = state.status as ScorecardSignal["status"];
    if (status === ("pending" as string) || status === ("seeded" as string)) status = surfacedTurn === null ? "not_surfaced" : "missed";
    let evidenceTurn: number | null = state.evidenceTurn ?? null;
    let evidenceQuote: string | null = state.evidenceQuote ?? null;

    if (surfacedTurn === null) {
      if (r && r.status !== "not_surfaced") log.push({ target, check: "not_surfaced is fixed", before: r.status, after: "not_surfaced" });
      return { signalId: def.id, label: def.label, kind: def.kind, difficulty: def.difficulty, status: "not_surfaced", surfacedTurn, personaQuote, evidenceTurn: null, evidenceQuote: null, suggestedQuestion: null, note: null };
    }

    if (r) {
      const window = windowAfter(surfacedTurn);
      if (r.status === "caught" || r.status === "partial") {
        const evTurn = r.evidenceTurn;
        const evText = evTurn !== null ? turns[evTurn]?.text : undefined;
        const inWindow = evTurn !== null && window.includes(evTurn);
        const quoteOk = evText !== undefined && quoteIn(r.evidenceQuote, evText);
        if (inWindow && quoteOk) {
          if (status !== r.status) log.push({ target, check: "review verdict with valid evidence", before: status, after: r.status });
          status = r.status;
          evidenceTurn = evTurn;
          evidenceQuote = r.evidenceQuote.trim();
        } else if (status === "caught" || status === "partial") {
          log.push({ target, check: inWindow ? "review quote not verbatim — kept session verdict" : "review evidence outside window — kept session verdict", before: `${r.status}@${evTurn} "${r.evidenceQuote}"`, after: status });
        } else {
          log.push({ target, check: inWindow ? "verdict quote not found in transcript" : "verdict without evidence in the follow-up window", before: `${r.status}@${evTurn} "${r.evidenceQuote}"`, after: "unsure" });
          status = "unsure";
          evidenceTurn = null;
          evidenceQuote = null;
        }
      } else if (r.status === "missed" || r.status === "unsure") {
        if (status !== r.status) log.push({ target, check: "review revisited verdict", before: status, after: r.status });
        status = r.status;
        if (r.status === "missed") {
          evidenceTurn = null;
          evidenceQuote = null;
        }
      }
    }
    // Evidence recorded during the session must still be a real quote.
    if ((status === "caught" || status === "partial") && (evidenceTurn === null || !turns[evidenceTurn] || !quoteIn(evidenceQuote ?? "", turns[evidenceTurn]!.text))) {
      if (evidenceTurn !== null && turns[evidenceTurn]) {
        log.push({ target, check: "session evidence quote repaired", before: evidenceQuote ?? "", after: turns[evidenceTurn]!.text });
        evidenceQuote = turns[evidenceTurn]!.text;
      } else {
        log.push({ target, check: "no evidence for verdict", before: status, after: "unsure" });
        status = "unsure";
        evidenceTurn = null;
        evidenceQuote = null;
      }
    }

    // Suggested question: only for not-caught, never a repeat of what was asked, always tied to a persona detail.
    let suggestedQuestion: string | null = null;
    if (status !== "caught") {
      const proposed = r?.suggestedQuestion?.trim() ?? "";
      if (proposed && askedTexts.some((q) => similarity(q, proposed) >= 0.7)) {
        log.push({ target, check: "suggested question duplicates an asked question", before: proposed, after: "(dropped)" });
      } else if (proposed) {
        suggestedQuestion = proposed;
      }
      if (!suggestedQuestion) {
        const snippet = personaQuote ? personaQuote.split(/(?<=[.!?…])\s+/)[0]!.slice(0, 80) : def.label;
        suggestedQuestion = `${guide.persona.name.split(" ").at(-1)} vừa nhắc "${snippet}" — kể mình nghe thêm, lúc đó chính xác chuyện gì đã xảy ra?`;
        log.push({ target, check: "suggested question fallback", before: proposed || "(none)", after: suggestedQuestion });
      }
    }

    const note = status === "unsure" ? (r?.note?.trim() || "Hệ thống chưa chắc chắn — câu hỏi tiếp theo không đủ rõ để kết luận.") : r?.note?.trim() || null;
    return { signalId: def.id, label: def.label, kind: def.kind, difficulty: def.difficulty, status, surfacedTurn, personaQuote, evidenceTurn, evidenceQuote, suggestedQuestion, note };
  });

  // Feedback: every item must quote a real question and cite a library principle (tool lookup, FR-7).
  const feedback: ScorecardFeedback[] = [];
  const seen = new Set<number>();
  for (const f of review.feedback) {
    const turn = turns[f.turnIndex];
    const target = `feedback:#${f.turnIndex}`;
    if (!turn || turn.role !== "user") {
      log.push({ target, check: "turn is not an interviewer question", before: String(f.turnIndex), after: "(dropped)" });
      continue;
    }
    if (f.type === "good" || seen.has(f.turnIndex)) continue;
    const principle = lookupPrinciple(f.type as QuestionType);
    if (!principle) {
      log.push({ target, check: "no library principle for this mistake type", before: f.type, after: "(dropped)" });
      continue;
    }
    if (!f.rewrite.trim()) {
      log.push({ target, check: "feedback has no rewrite", before: f.type, after: "(dropped)" });
      continue;
    }
    seen.add(f.turnIndex);
    feedback.push({ turnIndex: f.turnIndex, type: f.type as ScorecardFeedback["type"], original: turn.text, rewrite: f.rewrite.trim(), principleId: principle.id, principleName: principle.name, impact: Math.round(f.impact) });
  }
  feedback.sort((a, b) => b.impact - a.impact || a.turnIndex - b.turnIndex);

  // Focus: 1–3 items, principle ids must exist; derive one if the model gave none.
  const principleIds = new Set(listPrinciples().map((p) => p.id));
  let focus: ScorecardFocus[] = review.focus
    .filter((f) => f.skill.trim())
    .slice(0, 3)
    .map((f) => {
      const pid = f.principleId && principleIds.has(f.principleId) ? f.principleId : null;
      if (f.principleId && !pid) log.push({ target: `focus:${f.skill}`, check: "unknown principle id", before: f.principleId, after: "null" });
      return { skill: f.skill.trim(), why: f.why.trim(), principleId: pid };
    });
  if (!focus.length) {
    focus = [deriveFocus(signals, feedback)];
    log.push({ target: "focus", check: "model returned no focus", before: "[]", after: focus[0]!.skill });
  }

  const counts = countStatuses(signals.map((s) => s.status));
  const score = session.status === "complete" ? computeScore(counts) : null;
  const scorecard: Scorecard = {
    generatedAt: new Date().toISOString(),
    score,
    counts,
    signals,
    feedback,
    focus,
    summary: review.summary.trim(),
  };
  return { scorecard, log };
}

/** Fallback focus when the review returned none: based on what was missed most. */
function deriveFocus(signals: ScorecardSignal[], feedback: ScorecardFeedback[]): ScorecardFocus {
  const missed = signals.filter((s) => s.status === "missed" || s.status === "partial");
  const byKind: Record<string, ScorecardFocus> = {
    emotion: { skill: "Đi theo tín hiệu cảm xúc", why: "Có chi tiết cảm xúc persona thả ra mà bạn chưa hỏi tiếp.", principleId: "P07" },
    contradiction: { skill: "Truy những chỗ mâu thuẫn", why: "Persona có nói hai điều không khớp nhau mà bạn chưa hỏi lại.", principleId: "P10" },
    trailing: { skill: "Dùng lại chính lời của họ", why: "Persona bỏ lửng một ý — trích lại lời họ để mời kể tiếp.", principleId: "P08" },
    behavior: { skill: "Hỏi tiếp khi có người khác được nhắc đến", why: "Những người và thói quen được nhắc tới là chỗ đáng đào sâu.", principleId: "P09" },
  };
  if (missed.length) return byKind[missed[0]!.kind]!;
  if (feedback.length) return { skill: feedback[0]!.principleName, why: `Lỗi thường gặp nhất trong buổi này: câu hỏi ${feedback[0]!.type}.`, principleId: feedback[0]!.principleId };
  return { skill: "Giữ nhịp hỏi sâu", why: "Buổi này bạn bắt tốt — lần sau thử đào tới lớp lý do thật của mỗi chi tiết.", principleId: "P06" };
}
