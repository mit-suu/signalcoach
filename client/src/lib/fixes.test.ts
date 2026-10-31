// Run with: node --test src/lib/fixes.test.ts (native TypeScript stripping, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ScorecardFeedback, ScorecardSignal, Turn } from "@/types/api";
import { buildFixes } from "./fixes.ts";

const fb = (turnIndex: number, impact: number, type: ScorecardFeedback["type"] = "leading"): ScorecardFeedback => ({
  turnIndex,
  type,
  original: `câu ${turnIndex}`,
  rewrite: `câu tốt hơn ${turnIndex}`,
  principleId: "P03",
  principleName: "Đừng dẫn dắt câu trả lời",
  impact,
});
const sig = (over: Partial<ScorecardSignal>): ScorecardSignal => ({
  signalId: "x",
  label: "Chồng lo chuyện tiền",
  kind: "behavior",
  difficulty: "easy",
  status: "missed",
  surfacedTurn: 4,
  personaQuote: "Chồng mình lo hết",
  evidenceTurn: null,
  evidenceQuote: null,
  suggestedQuestion: "Chị kể thêm về việc anh ấy lo tiền?",
  note: null,
  ...over,
});
const turns: Turn[] = [
  { index: 0, role: "persona", text: "Chào" },
  { index: 3, role: "user", text: "Chị dùng app nào?" },
  { index: 4, role: "persona", text: "Chồng mình lo hết" },
  { index: 5, role: "user", text: "Chị có thích app không?" },
];

test("top 3 by impact, each with asked → why → better", () => {
  const fixes = buildFixes({ feedback: [fb(3, 1), fb(7, 3, "vague"), fb(9, 2), fb(11, 1)], signals: [] }, turns, "Lê Thị Mai");
  assert.deepEqual(fixes.map((f) => f.turnIndex), [7, 9, 3]);
  assert.ok(fixes.every((f) => f.source === "feedback"));
  assert.equal(fixes[0]!.asked, "câu 7");
  assert.equal(fixes[0]!.better, "câu tốt hơn 7");
  assert.match(fixes[0]!.why, /cụ thể/);
  assert.match(fixes[0]!.title, /một lần cụ thể/);
});

test("equal impact → earlier question first", () => {
  const fixes = buildFixes({ feedback: [fb(9, 2), fb(3, 2), fb(5, 2)], signals: [] }, turns, "Mai");
  assert.deepEqual(fixes.map((f) => f.turnIndex), [3, 5, 9]);
});

test("fewer than 3 feedback items → filled from missed clues with a suggested question", () => {
  const fixes = buildFixes({ feedback: [fb(3, 2)], signals: [sig({}), sig({ signalId: "y", suggestedQuestion: null }), sig({ signalId: "z", status: "caught" })] }, turns, "Lê Thị Mai");
  assert.equal(fixes.length, 2);
  const missed = fixes[1]!;
  assert.equal(missed.source, "clue");
  assert.equal(missed.turnIndex, 5); // the question right after Mai mentioned it
  assert.equal(missed.asked, "Chị có thích app không?");
  assert.equal(missed.better, "Chị kể thêm về việc anh ấy lo tiền?");
  assert.match(missed.why, /Mai vừa nói “Chồng mình lo hết”/);
});

test("a clue fix is skipped when its next question already has a feedback item (no #NN cited twice)", () => {
  const fixes = buildFixes({ feedback: [fb(5, 2)], signals: [sig({})] }, turns, "Mai");
  assert.deepEqual(fixes.map((f) => [f.source, f.turnIndex]), [["feedback", 5]]);
});

test("clue with no question after it → turnIndex and asked are null, why says you never asked", () => {
  const fixes = buildFixes({ feedback: [], signals: [sig({ surfacedTurn: 6 })] }, turns, "Mai");
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0]!.source, "clue");
  assert.equal(fixes[0]!.turnIndex, null);
  assert.equal(fixes[0]!.asked, null);
  assert.match(fixes[0]!.why, /chưa hỏi lại/);
});

test("nothing to fix → empty list (the page shows a 'no major mistakes' message)", () => {
  assert.deepEqual(buildFixes({ feedback: [], signals: [sig({ status: "caught" })] }, turns, "Mai"), []);
});
