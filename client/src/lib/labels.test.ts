// Run with: node --test src/lib/labels.test.ts (native TypeScript stripping, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLUE_EXPLAINER, HINT_TEXT, QUESTION_TEXT, QUESTION_WHY, FIX_TITLE, SIGNAL_TEXT, STATUS_TEXT, KIND_TEXT, actionText, plain } from "./labels.ts";

/** Internal terms the reviewer flagged (spec: Boundaries › Always). */
const FORBIDDEN = /tín hiệu|persona|agent|\blớp\b|thả tín hiệu|“tại sao” trống|\bP\d\d\b|\bN?FR-\d|\b(leading|closed|vague|double|future|bare_why|over_talking)\b/i;

test("plain() turns internal words into everyday ones and drops ids", () => {
  assert.equal(plain("Bạn bỏ lỡ tín hiệu về chồng (FR-5).", "Mai"), "Bạn bỏ lỡ manh mối về chồng.");
  assert.equal(plain("Tín hiệu cảm xúc: persona thở dài", "Mai"), "Manh mối cảm xúc: Mai thở dài");
  assert.equal(plain("Đào sâu bằng câu chuyện, không phải \"tại sao\" trống"), "Đào sâu bằng câu chuyện, không phải “tại sao” cụt lủn");
  assert.equal(plain("Xem nguyên tắc P03 để hỏi lại"), "Xem nguyên tắc để hỏi lại");
});

test("model-like text comes out of plain() with no internal term", () => {
  const raw = [
    "Bạn bỏ lỡ tín hiệu cảm xúc persona thả ra ở #4 (FR-5).",
    "Lỗi thường gặp nhất trong buổi này: câu hỏi leading.",
    "Agent thấy câu hỏi closed và double làm persona trả lời ngắn (P03).",
    "Buổi này bạn bắt tốt — lần sau thử đào tới lớp lý do thật của mỗi chi tiết.",
    "Tín hiệu bị bỏ qua sau câu bare_why, over_talking, future và vague.",
    // decision reasons written by the state machine
    'Câu hỏi đào sâu đúng chi tiết "Như làm bài tập về nhà" — persona mở lòng kể lớp 2.',
    "Câu hỏi tốt nhưng không còn lớp sâu hơn để kể.",
  ];
  for (const r of raw) {
    const out = plain(r, "Mai");
    assert.doesNotMatch(out, FORBIDDEN, out);
  }
  assert.equal(plain("Lỗi thường gặp nhất: câu hỏi leading.", "Mai"), "Lỗi thường gặp nhất: câu hỏi gợi sẵn câu trả lời.");
  assert.equal(plain("agent quyết định"), "SignalCoach quyết định");
});

test("no label shows an internal term", () => {
  const all = [
    CLUE_EXPLAINER,
    HINT_TEXT.dig("Mai"),
    HINT_TEXT.open(),
    ...Object.values(QUESTION_TEXT),
    ...Object.values(QUESTION_WHY),
    ...Object.values(FIX_TITLE),
    ...Object.values(SIGNAL_TEXT),
    ...Object.values(STATUS_TEXT),
    ...Object.values(KIND_TEXT),
    ...(["answer", "plant_signal", "go_deeper", "answer_briefly", "clarify", "propose_end", "stay_in_character"] as const).map((a) => actionText(a, "Mai")),
  ];
  for (const s of all) assert.doesNotMatch(s, FORBIDDEN, s);
});

test("hints never name a clue", () => {
  assert.doesNotMatch(HINT_TEXT.dig("Mai"), /manh mối|tín hiệu/i);
});
