import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { selfCheck } from "../src/agent/review";
import { loadContent } from "../src/services/content.service";
import { GuideSchema } from "../src/types/content";
import type { SessionDoc } from "../src/models/session.model";

const guide = GuideSchema.parse(JSON.parse(readFileSync(path.join(__dirname, "..", "content", "guides", "budgeting-app.json"), "utf8")));

/** A plain object shaped like the session document — selfCheck only reads it. */
function fakeSession(): SessionDoc {
  const turns = [
    { index: 0, role: "persona", text: guide.persona.openingMessage },
    { index: 1, role: "user", text: "Kể mình nghe hiện giờ chị theo dõi chi tiêu thế nào?", questionType: "good" },
    { index: 2, role: "persona", text: guide.signals[0]!.layers[0]!.reveal, signalId: "mai-two-weeks", layerDepth: 1 },
    { index: 3, role: "user", text: "Chuyện gì đã xảy ra sau hai tuần đó?", questionType: "good" },
    { index: 4, role: "persona", text: guide.signals[0]!.layers[1]!.reveal, signalId: "mai-two-weeks", layerDepth: 2 },
    { index: 5, role: "user", text: "Chị thấy app nhắc nhở hữu ích đúng không?", questionType: "leading" },
    { index: 6, role: "persona", text: guide.signals[4]!.layers[0]!.reveal, signalId: "mai-reminder", layerDepth: 1 },
    { index: 7, role: "user", text: "Chị thường quản lý tiền thế nào?", questionType: "vague" },
    { index: 8, role: "persona", text: "Cũng bình thường thôi." },
    { index: 9, role: "user", text: "Trong nhà chuyện tiền ai quyết?", questionType: "good" },
    { index: 10, role: "persona", text: "Chồng mình chủ yếu." },
    { index: 11, role: "user", text: "Thế còn con cái thì sao?", questionType: "good" },
    { index: 12, role: "persona", text: "Ừ cũng tốn." },
  ];
  const signals = guide.signals.map((s) => ({ signalId: s.id, status: "not_surfaced", layer: 0, questionsSinceSeeded: 0 }));
  Object.assign(signals[0]!, { status: "caught", layer: 2, surfacedTurn: 2, evidenceTurn: 3, evidenceQuote: "Chuyện gì đã xảy ra sau hai tuần đó?", confidence: 0.9 });
  Object.assign(signals[4]!, { status: "missed", layer: 1, surfacedTurn: 6, questionsSinceSeeded: 2 });
  return { guide, turns, signals, status: "incomplete", questionCount: 6 } as unknown as SessionDoc;
}

beforeAll(() => loadContent());

describe("self-check pass (FR-6)", () => {
  it("keeps verdicts that have verbatim evidence in the window, drops the rest to unsure", () => {
    const s = fakeSession();
    const { scorecard, log } = selfCheck(s, {
      signals: [
        { signalId: "mai-two-weeks", status: "caught", evidenceTurn: 3, evidenceQuote: "sau hai tuần đó", suggestedQuestion: "", note: "" },
        // claims a catch with a quote that is not in the transcript
        { signalId: "mai-reminder", status: "caught", evidenceTurn: 7, evidenceQuote: "lúc 9 giờ tối chị làm gì", suggestedQuestion: "Lúc 9 giờ tối chị đang làm gì?", note: "" },
        // tries to change a not_surfaced signal — must be ignored
        { signalId: "mai-husband", status: "caught", evidenceTurn: 9, evidenceQuote: "ai quyết", suggestedQuestion: "", note: "" },
      ],
      feedback: [
        { turnIndex: 5, type: "leading", rewrite: "Lần gần nhất có nhắc nhở, chuyện gì đã xảy ra?", impact: 3 },
        { turnIndex: 7, type: "vague", rewrite: "Kể về lần gần nhất chị ngồi xem lại chi tiêu.", impact: 1 },
        { turnIndex: 2, type: "closed", rewrite: "x", impact: 1 }, // not a user turn
        { turnIndex: 9, type: "over_talking", rewrite: "y", impact: 1 },
      ],
      focus: [{ skill: "Đi theo tín hiệu cảm xúc", why: "…", principleId: "P07" }, { skill: "Bogus", why: "", principleId: "P99" }],
      summary: "ok",
    });
    const by = Object.fromEntries(scorecard.signals.map((x) => [x.signalId, x]));
    expect(by["mai-two-weeks"]!.status).toBe("caught");
    expect(by["mai-two-weeks"]!.evidenceQuote).toBe("sau hai tuần đó");
    expect(by["mai-reminder"]!.status).toBe("unsure");
    expect(by["mai-reminder"]!.suggestedQuestion).toContain("9 giờ tối");
    expect(by["mai-husband"]!.status).toBe("not_surfaced");
    expect(log.some((l) => l.target === "signal:mai-reminder" && l.after === "unsure")).toBe(true);
    expect(log.some((l) => l.target === "signal:mai-husband")).toBe(true);

    // feedback: every item cites a principle; the non-user turn is dropped; sorted by impact
    expect(scorecard.feedback.map((f) => f.turnIndex)).toEqual([5, 7, 9]); // impact desc, then turn order
    expect(scorecard.feedback[0]!.principleId).toBe("P03");
    expect(scorecard.feedback.every((f) => f.principleName)).toBe(true);
    expect(scorecard.feedback[0]!.original).toBe("Chị thấy app nhắc nhở hữu ích đúng không?");

    // focus: unknown principle id nulled, not dropped
    expect(scorecard.focus).toHaveLength(2);
    expect(scorecard.focus[1]!.principleId).toBeNull();

    // incomplete session → no score, but counts present
    expect(scorecard.score).toBeNull();
    expect(scorecard.counts.not_surfaced).toBe(4);
  });

  it("drops a suggested question that repeats what the interviewer already asked", () => {
    const s = fakeSession();
    const { scorecard, log } = selfCheck(s, {
      signals: [{ signalId: "mai-reminder", status: "missed", evidenceTurn: null, evidenceQuote: "", suggestedQuestion: "Chị thường quản lý tiền thế nào?", note: "" }],
      feedback: [],
      focus: [],
      summary: "",
    });
    const r = scorecard.signals.find((x) => x.signalId === "mai-reminder")!;
    expect(r.suggestedQuestion).not.toBe("Chị thường quản lý tiền thế nào?");
    expect(log.some((l) => l.check.includes("duplicates"))).toBe(true);
    expect(scorecard.focus).toHaveLength(1); // derived fallback
  });

  it("scores a complete session with the PRD formula", () => {
    const s = fakeSession();
    (s as unknown as { status: string }).status = "complete";
    for (const sig of s.signals) if (sig.status === "not_surfaced") Object.assign(sig, { status: "missed", surfacedTurn: 8 });
    const { scorecard } = selfCheck(s, { signals: [], feedback: [], focus: [], summary: "" });
    // 1 caught, 0 partial, 5 missed, 0 unsure → 1/6
    expect(scorecard.score).toBeCloseTo(1 / 6, 3);
  });
});
