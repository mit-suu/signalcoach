import type { AgentAction, QuestionType, SessionStatus, SignalKind, SignalStatus } from "@/types/api";

/**
 * Every learner-facing label lives here so the copy stays in one place. Plain Vietnamese: short
 * sentences, everyday words. In the UI a "signal" is a "manh mối" (server code and data keep `signal`).
 * Only type imports, so `node --test` can load this file (see labels.test.ts).
 */

export const CLUE = "manh mối";

/** One-line explainer shown next to every place that counts clues. */
export const CLUE_EXPLAINER = "Manh mối là chi tiết người dùng chỉ nhắc thoáng qua một lần. Hỏi sâu ngay lúc đó thì họ kể tiếp, lướt qua thì chi tiết đó trôi mất.";

export const STATUS_TEXT: Record<SessionStatus, string> = {
  active: "Đang luyện dở",
  complete: "Đã xong",
  incomplete: "Dừng sớm",
  insufficient: "Ngắn quá",
};

export const SIGNAL_TEXT: Record<SignalStatus, string> = {
  caught: "Tìm được",
  partial: "Hỏi chưa tới",
  missed: "Bỏ lỡ",
  unsure: "Chưa rõ",
  not_surfaced: "Chưa kịp kể",
};

export const KIND_TEXT: Record<SignalKind, string> = {
  emotion: "Cảm xúc",
  trailing: "Nói dở chừng",
  contradiction: "Nói một đằng, làm một nẻo",
  behavior: "Thói quen",
};

/** Short name for each kind of question. */
export const QUESTION_TEXT: Record<QuestionType, string> = {
  good: "Câu hỏi tốt",
  leading: "Gợi sẵn câu trả lời",
  closed: "Chỉ trả lời có/không",
  vague: "Chung chung",
  double: "Hai ý một câu",
  future: "Hỏi chuyện giả định",
  bare_why: "Chỉ hỏi “tại sao”",
  over_talking: "Bạn nói nhiều hơn hỏi",
};

/** Why a question of this kind falls short — the "Vì sao chưa tốt" line on the scorecard. */
export const QUESTION_WHY: Record<QuestionType, string> = {
  good: "Câu hỏi mở, giúp người kia kể chuyện thật.",
  leading: "Câu hỏi đã gợi sẵn câu trả lời. Người kia dễ gật đầu cho xong, bạn không biết họ thật sự nghĩ gì.",
  closed: "Câu này chỉ cần trả lời có hoặc không, nên người kia không kể thêm gì.",
  vague: "Hỏi chung chung thì nhận về câu trả lời chung chung. Người ta nhớ một lần cụ thể rõ hơn nhiều so với “thường thì”.",
  double: "Hai ý trong một câu. Người kia chỉ trả lời một ý, ý còn lại bị bỏ qua.",
  future: "Hỏi chuyện chưa xảy ra thì người ta đoán. Bạn cần chuyện đã xảy ra thật.",
  bare_why: "Chỉ hỏi “tại sao” dễ làm người kia thấy bị hỏi vặn và phải tìm lý do bào chữa.",
  over_talking: "Bạn nói dài hơn người kia. Họ còn ít chỗ để kể.",
};

/** Heading of a "điều cần sửa" card, per question kind. */
export const FIX_TITLE: Record<QuestionType, string> = {
  good: "Giữ cách hỏi này",
  leading: "Đừng gợi sẵn câu trả lời",
  closed: "Hỏi để người kia kể, không chỉ có hay không",
  vague: "Hỏi về một lần cụ thể, không hỏi “thường thì”",
  double: "Mỗi lần chỉ hỏi một ý",
  future: "Hỏi chuyện đã xảy ra, không hỏi giả định",
  bare_why: "Thay “tại sao” bằng “chuyện gì đã xảy ra”",
  over_talking: "Nói ít, hỏi ngắn, để người kia kể",
};

/** What the simulated user did on a reply, in one plain sentence (review page). */
export function actionText(action: AgentAction, name: string): string {
  switch (action) {
    case "plant_signal":
      return `${name} nhắc thoáng qua một chi tiết đáng hỏi sâu.`;
    case "go_deeper":
      return `Bạn hỏi đúng chỗ, nên ${name} kể sâu hơn.`;
    case "answer_briefly":
      return `Câu hỏi khiến ${name} chỉ trả lời qua loa, không kể thêm.`;
    case "clarify":
      return `Câu hỏi có hai ý, nên ${name} hỏi lại bạn muốn nghe ý nào.`;
    case "propose_end":
      return `${name} đã kể gần hết và muốn kết thúc buổi.`;
    case "stay_in_character":
      return `${name} không làm theo yêu cầu đó và quay về chuyện của mình.`;
    default:
      return `${name} trả lời bình thường.`;
  }
}

/** Coaching hint under a reply (session room). Never says which detail — only that one came up. */
export const HINT_TEXT = {
  dig: (name: string) => `${name} vừa nhắc một chi tiết đáng hỏi thêm. Hỏi sâu về nó trước khi sang chuyện khác — ví dụ chuyện đó xảy ra lần gần nhất là khi nào.`,
  open: () => "Thử hỏi về một lần cụ thể gần đây, ví dụ “Lần gần nhất chuyện đó xảy ra là khi nào?”. Câu hỏi mở giúp người kia kể nhiều hơn.",
} as const;

/** Static tip in the session side panel. */
export const ROOM_TIP = "Hỏi về một lần cụ thể gần đây thay vì hỏi “thường thì…”.";

/** Raw question-type ids that sometimes leak into model-written text. */
const RAW_TYPE = /\b(leading|closed|vague|double|future|bare_why|over_talking)\b/gi;

/**
 * Clean model-written text before showing it: internal words → plain ones (tín hiệu, persona, agent,
 * raw question-type ids), spec / principle ids removed.
 * Used on summaries, focus lines, reasons, notes and principle names that come from the server.
 */
export function plain(text: string, name = "người dùng"): string {
  return text
    .replace(/\s*\((?:N?FR-[\d, NFR-]+|P\d\d)\)/g, "")
    .replace(/\b(?:N?FR-\d+|P\d\d)\b:?\s*/g, "")
    .replace(/["“]tại sao["”]\s*trống/gi, "“tại sao” cụt lủn")
    .replace(/tín hiệu/gi, (m) => (m[0] === "T" ? "Manh mối" : "manh mối"))
    .replace(/\bpersona\b/gi, name)
    .replace(/\bagent\b/gi, "SignalCoach")
    .replace(/(^|\s)lớp (?=lý do)/gi, "$1")
    .replace(/(^|\s)lớp (?:\d+|sâu hơn)/gi, "$1phần sâu hơn")
    .replace(RAW_TYPE, (t) => {
      const label = QUESTION_TEXT[t.toLowerCase() as QuestionType];
      return label[0]!.toLowerCase() + label.slice(1);
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
export const pct = (score: number | null) => (score === null ? null : Math.round(score * 100));
export const shortName = (name: string) => name.trim().split(" ").at(-1) ?? name;
/** "#07" — turn numbers as the scorecard and review show them. */
export const turnNo = (n: number) => `#${String(n).padStart(2, "0")}`;
