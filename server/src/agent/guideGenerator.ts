import { z } from "zod";
import { Types } from "mongoose";
import { llm, type ChatMessage } from "../lib/llm";
import { llmRoles } from "../config/env";
import { logger } from "../config/logger";
import { GuideSchema, type Guide } from "../types/content";
import { extractJson } from "./judge";

/**
 * GUIDE GENERATOR (v1.1 feature, addendum "Guide generation"): the agent writes a complete
 * interview guide — persona + 5–6 layered signals — from the user's description of their own
 * product and target user. Output must validate against GuideSchema before it is saved; vague
 * input gets a clarifying question back instead of an invented guide.
 */
export interface GuideBrief {
  product: string;
  audience: string;
  goal?: string;
  notes?: string;
}

export type GuideGenerationResult = { kind: "guide"; guide: Guide } | { kind: "clarify"; question: string };

const ClarifySchema = z.object({ needsClarification: z.string().min(1) });

const RAW_GUIDE_SCHEMA = {
  type: "object",
  properties: {
    needsClarification: { type: "string", nullable: true },
    context: { type: "string" },
    title: { type: "string" },
    goal: { type: "string" },
    estimatedMinutes: { type: "integer" },
    suggestedQuestions: { type: "array", items: { type: "string" } },
    persona: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        age: { type: "integer" },
        initial: { type: "string" },
        tagline: { type: "string" },
        background: { type: "string" },
        traits: { type: "array", items: { type: "string" } },
        speakingStyle: { type: "string" },
        openingMessage: { type: "string" },
      },
      required: ["id", "name", "age", "initial", "tagline", "background", "traits", "speakingStyle", "openingMessage"],
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          kind: { type: "string", enum: ["emotion", "trailing", "contradiction", "behavior"] },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          layers: {
            type: "array",
            items: {
              type: "object",
              properties: { depth: { type: "integer" }, reveal: { type: "string" }, unlockIntent: { type: "string" } },
              required: ["depth", "reveal", "unlockIntent"],
            },
          },
          rationalization: { type: "string" },
        },
        required: ["id", "label", "kind", "difficulty", "layers", "rationalization"],
      },
    },
  },
  required: ["needsClarification", "context", "title", "goal", "estimatedMinutes", "suggestedQuestions", "persona", "signals"],
};

export function buildGuideMessages(brief: GuideBrief, previousErrors?: string): ChatMessage[] {
  const system = [
    "TASK=generate_guide",
    "Bạn là nhà nghiên cứu UX giàu kinh nghiệm, thiết kế KỊCH BẢN LUYỆN PHỎNG VẤN cho một người đang học phỏng vấn người dùng. Kịch bản gồm một persona (người được phỏng vấn, do AI đóng) và 5–6 'tín hiệu': những chi tiết persona sẽ cố tình thả vào cuộc trò chuyện mà một người phỏng vấn giỏi phải nhận ra và hỏi sâu.",
    "",
    "Yêu cầu nội dung (tiếng Việt, giọng tự nhiên như người thật nhắn tin):",
    "- context: nhãn ngắn kiểu 'Khám phá sản phẩm' / 'Làm quen sản phẩm' / 'Cộng tác nhóm' / 'Giữ chân người dùng'.",
    "- title: tên kịch bản ngắn (≤ 40 ký tự). goal: mục tiêu nghiên cứu, 1 câu. estimatedMinutes: 15.",
    "- suggestedQuestions: 4 câu hỏi mở, hỏi về chuyện đã xảy ra, không dẫn dắt.",
    "- persona: id (slug không dấu), name (tên Việt hoặc phù hợp bối cảnh), age, initial (1 chữ cái đầu tên gọi), tagline (≤ 60 ký tự), background (1–2 câu), traits (3 tính từ), speakingStyle (cách xưng hô, nhịp nói, khi nào mở lòng), openingMessage (câu chào mở đầu, nhắc tới giới hạn thời gian).",
    "- signals: 6 tín hiệu, id = slug '<persona>-<tu-khoa>', label ≤ 40 ký tự. Đủ 4 loại kind: emotion (cảm xúc mạnh/né tránh), trailing (bỏ lửng ý), contradiction (nói hai điều không khớp), behavior (thói quen hoặc người khác liên quan). Độ khó: 2 easy, 2 medium, 2 hard.",
    "  Mỗi tín hiệu có 3 layers: depth 1 = câu persona thả ra trong lúc trả lời (kể vội rồi chuyển ý, KHÔNG giải thích); depth 2 = chuyện cụ thể đã xảy ra, kể khi được hỏi tiếp; depth 3 = lý do thật / điều persona thực sự cần. unlockIntent mô tả kiểu câu hỏi tiếp mở được lớp đó (theo ý, không theo từ khoá). rationalization = câu viện lý do khi bị hỏi 'tại sao' trống.",
    "- Các tín hiệu phải nhất quán với nhau và với background; chi tiết cụ thể (con số, thời điểm, người, tình huống) thay vì chung chung. Không được chào hàng sản phẩm; persona là người dùng thật có vấn đề thật.",
    "",
    "Nếu mô tả đầu vào quá mơ hồ để dựng persona đáng tin (không rõ sản phẩm làm gì hoặc ai dùng), KHÔNG bịa: trả về {\"needsClarification\": \"<một câu hỏi làm rõ, tiếng Việt>\"} và để các trường khác rỗng. Ngược lại needsClarification = null.",
    "Trả về JSON đúng schema.",
  ].join("\n");

  const user = [
    `PRODUCT=${brief.product.replace(/\s+/g, " ")}`,
    `Sản phẩm / dự án: ${brief.product}`,
    `Người dùng cần phỏng vấn: ${brief.audience}`,
    brief.goal ? `Mục tiêu nghiên cứu: ${brief.goal}` : "",
    brief.notes ? `Ghi chú thêm: ${brief.notes}` : "",
    previousErrors ? `\nLần trước JSON không hợp lệ, hãy sửa:\n${previousErrors}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function generateGuide(brief: GuideBrief): Promise<GuideGenerationResult> {
  let errors: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm.completeJson(buildGuideMessages(brief, errors), { ...llmRoles.review, maxTokens: 8192, jsonSchema: RAW_GUIDE_SCHEMA, temperature: 0.7 });
    const json = JSON.parse(extractJson(raw)) as Record<string, unknown>;
    const clarify = ClarifySchema.safeParse(json);
    if (clarify.success) return { kind: "clarify", question: clarify.data.needsClarification };

    delete json.needsClarification;
    const candidate = { ...json, id: new Types.ObjectId().toHexString() };
    const parsed = GuideSchema.safeParse(candidate);
    if (parsed.success) {
      const guide = parsed.data;
      // Hard guarantees the schema can't express: ≥1 easy and ≥1 hard signal, unique ids, ≥2 layers.
      const ids = new Set<string>();
      for (const s of guide.signals) {
        if (ids.has(s.id)) s.id = `${s.id}-${ids.size}`;
        ids.add(s.id);
      }
      const difficulties = new Set(guide.signals.map((s) => s.difficulty));
      if (!difficulties.has("easy")) guide.signals[0]!.difficulty = "easy";
      if (!difficulties.has("hard")) guide.signals.at(-1)!.difficulty = "hard";
      guide.persona.initial = (guide.persona.initial || guide.persona.name.trim().split(" ").at(-1)![0]!).slice(0, 1).toUpperCase();
      return { kind: "guide", guide };
    }
    errors = z.prettifyError(parsed.error);
    logger.warn({ attempt, errors: errors.slice(0, 400) }, "generated guide failed validation");
  }
  throw new Error(`generated guide invalid: ${errors}`);
}
