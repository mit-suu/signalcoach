import type { ChatMessage } from "./llm";

/**
 * Offline stand-in for the model, used by tests and for UI work without a key.
 * It is deliberately dumb but *shaped right*: every prompt in src/agent carries a `TASK=` marker
 * and a few machine-readable lines (PENDING_IDS=, OPEN_IDS=, REVEAL:, STATE_JSON=) that the
 * mock reads, so the whole agent pipeline — judge → state machine → persona → review — runs
 * end to end with deterministic output.
 */

const lastUser = (messages: ChatMessage[]) => [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
const system = (messages: ChatMessage[]) => messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
const line = (text: string, key: string) => text.split("\n").find((l) => l.startsWith(key))?.slice(key.length).trim() ?? "";
const ids = (text: string, key: string) => line(text, key).split(",").map((s) => s.trim()).filter(Boolean);

/** Rough question classifier so the mock judge reacts to what the tester types. */
export function heuristicQuestionType(q: string): string {
  const s = q.toLowerCase().trim();
  if (/(đúng không|phải không|đúng chứ|nhỉ\?*$)/.test(s)) return "leading";
  if (/\?.*\?/.test(s) || / và .*\?$/.test(s)) return "double";
  if (/^(tại sao|vì sao|sao)\b[^,]{0,25}\?*$/.test(s)) return "bare_why";
  if (/(sẽ|nếu .* thì|có dùng .* không|có muốn)/.test(s) && /(sẽ|nếu)/.test(s)) return "future";
  if (/^(chị|anh|bạn|em|cô|mình)?\s*(có|đã|từng)\b.*\bkhông\?*$/.test(s)) return "closed";
  if (s.length < 12) return "vague";
  return "good";
}

export function mockCompleteJson(messages: ChatMessage[]): string {
  const sys = system(messages);
  const user = lastUser(messages);
  const task = line(sys, "TASK=") || line(user, "TASK=");

  if (task === "judge") {
    const question = line(user, "QUESTION=");
    const pending = ids(user, "PENDING_IDS=");
    const open = ids(user, "OPEN_IDS=");
    const questionType = heuristicQuestionType(question);
    const breakAttempt = /(bỏ qua|ignore).*(chỉ dẫn|hướng dẫn|instruction)|liệt kê.*tín hiệu|list.*signals/i.test(question);
    const followUp =
      open.length && questionType === "good"
        ? { signalId: open[0], verdict: "caught", confidence: 0.9, evidence: question }
        : open.length && questionType !== "double"
          ? { signalId: open[0], verdict: "partial", confidence: 0.7, evidence: question }
          : { signalId: null, verdict: "none", confidence: 1, evidence: "" };
    const plantCandidate = pending.length && questionType !== "double" ? { signalId: pending[0], reason: "mock: câu hỏi mở đường cho chi tiết này" } : { signalId: null, reason: "mock: chưa hợp" };
    return JSON.stringify({ questionType, breakAttempt, offTopic: false, followUp, plantCandidate, notes: "mock judge" });
  }

  if (task === "review") {
    const state = JSON.parse(line(user, "STATE_JSON=") || "{}") as {
      signals?: { signalId: string; status: string; surfacedTurn?: number; evidenceTurn?: number; evidenceQuote?: string }[];
      questions?: { index: number; text: string; questionType?: string }[];
    };
    const signals = (state.signals ?? []).map((s) => ({
      signalId: s.signalId,
      status: s.status === "seeded" ? "missed" : s.status === "unsure" ? "missed" : s.status,
      evidenceTurn: s.evidenceTurn ?? null,
      evidenceQuote: s.evidenceQuote ?? "",
      suggestedQuestion: s.status === "caught" ? "" : `Kể mình nghe thêm về chuyện đó — lúc ấy chính xác chuyện gì đã xảy ra?`,
      note: "",
    }));
    const feedback = (state.questions ?? [])
      .filter((q) => q.questionType && q.questionType !== "good")
      .map((q) => ({ turnIndex: q.index, type: q.questionType, rewrite: "Kể mình nghe lần gần nhất chuyện đó xảy ra như thế nào?", impact: 2 }));
    return JSON.stringify({
      signals,
      feedback,
      focus: [{ skill: "Hỏi tiếp khi có người khác được nhắc đến", why: "mock: có chi tiết về người thân chưa được hỏi sâu", principleId: "P09" }],
      summary: "mock review",
    });
  }

  if (task === "generate_guide") {
    const brief = line(user, "PRODUCT=") || "Sản phẩm của bạn";
    const sig = (n: number, kind: string, difficulty: string) => ({
      id: `custom-s${n}`,
      label: `Tín hiệu ${n}`,
      kind,
      difficulty,
      layers: [
        { depth: 1, reveal: `Chi tiết ${n} mà persona kể vội rồi chuyển ý.`, unlockIntent: "Hỏi tiếp về chi tiết vừa kể" },
        { depth: 2, reveal: `Chuyện gì đã xảy ra quanh chi tiết ${n}.`, unlockIntent: "Hỏi về lần cụ thể" },
      ],
    });
    return JSON.stringify({
      id: "custom",
      context: "Kịch bản tuỳ chỉnh",
      title: brief.slice(0, 60),
      goal: `Hiểu cách người dùng thật sự dùng ${brief.slice(0, 40)} và vì sao họ bỏ.`,
      estimatedMinutes: 15,
      suggestedQuestions: ["Kể mình nghe lần gần nhất bạn dùng sản phẩm này.", "Chuyện gì đã xảy ra sau đó?", "Lần gần nhất nó không như ý là khi nào?"],
      persona: {
        id: "lan",
        name: "Nguyễn Lan",
        age: 31,
        initial: "L",
        tagline: "Người dùng mới, đã thử rồi bỏ",
        background: "Nhân viên văn phòng, đã thử sản phẩm hai tháng trước.",
        traits: ["Thân thiện", "Kể chuyện vòng vo"],
        speakingStyle: "Xưng mình, câu ngắn.",
        openingMessage: "Chào bạn, mình là Lan. Bạn hỏi gì cứ hỏi nhé.",
      },
      signals: [sig(1, "trailing", "easy"), sig(2, "emotion", "medium"), sig(3, "behavior", "medium"), sig(4, "contradiction", "hard"), sig(5, "behavior", "easy")],
    });
  }

  return "{}";
}

const CANNED = [
  "Ừm, để mình nghĩ chút… Thật ra mình cũng không theo dõi kỹ lắm đâu.",
  "Cũng bình thường thôi, mình làm theo thói quen là chính.",
  "À chuyện đó thì mình cũng không để ý lắm, thật.",
];
let canned = 0;

export function mockStreamText(messages: ChatMessage[]): string {
  const sys = system(messages);
  const reveal = line(sys, "REVEAL:");
  const action = line(sys, "ACTION=");
  if (action === "clarify") return "Xin lỗi — ý bạn là cái nào trước, cái thứ nhất hay cái thứ hai?";
  if (action === "stay_in_character") return "Haha, mình không hiểu lắm. Tín hiệu gì cơ? Mình tưởng đang nói chuyện bình thường mà.";
  if (action === "propose_end") return "Nói chuyện vui ghê. Chắc mình sắp phải đi rồi — bạn còn muốn hỏi gì nữa không?";
  if (reveal) return reveal;
  return CANNED[canned++ % CANNED.length]!;
}
