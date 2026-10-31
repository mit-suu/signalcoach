import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { selectHint } from "../src/agent/hint";
import { buildPersonaMessages } from "../src/agent/personaPrompt";
import { GuideSchema } from "../src/types/content";
import type { Decision } from "../src/agent/stateMachine";

type T = Parameters<typeof selectHint>[0][number];
const u = (index: number, questionType: string): T => ({ index, role: "user", questionType });
const p = (index: number, action = "answer"): T => ({ index, role: "persona", decision: { action } });

describe("in-session hint selection", () => {
  it("dig: the reply just planted a signal", () => {
    const turns = [p(0), u(1, "good"), p(2, "plant_signal")];
    expect(selectHint(turns, 2)).toEqual({ kind: "dig" });
  });

  it("open: the last two questions were weak and nothing was planted", () => {
    const turns = [p(0), u(1, "closed"), p(2), u(3, "leading"), p(4, "answer_briefly")];
    expect(selectHint(turns, 4)).toEqual({ kind: "open" });
    for (const t of ["vague", "future", "double", "bare_why"]) {
      expect(selectHint([p(0), u(1, t), p(2), u(3, "closed"), p(4)], 4)).toEqual({ kind: "open" });
    }
  });

  it("none: one weak question, a good one in between, over-talking, or the first question", () => {
    expect(selectHint([p(0), u(1, "closed"), p(2)], 2)).toBeNull();
    expect(selectHint([p(0), u(1, "closed"), p(2), u(3, "good"), p(4)], 4)).toBeNull();
    expect(selectHint([p(0), u(1, "over_talking"), p(2), u(3, "closed"), p(4)], 4)).toBeNull();
    expect(selectHint([p(0), u(1, "good"), p(2)], 2)).toBeNull();
  });

  it("dig wins over open when the planting reply follows two weak questions", () => {
    const turns = [p(0), u(1, "closed"), p(2), u(3, "leading"), p(4, "plant_signal")];
    expect(selectHint(turns, 4)).toEqual({ kind: "dig" });
  });

  it("only looks at turns up to the reply (idempotent replay gives the same hint)", () => {
    const turns = [p(0), u(1, "good"), p(2, "plant_signal"), u(3, "closed"), p(4), u(5, "closed"), p(6)];
    expect(selectHint(turns, 2)).toEqual({ kind: "dig" });
    expect(selectHint(turns, 4)).toBeNull();
    expect(selectHint(turns, 6)).toEqual({ kind: "open" });
  });

  it("skips role-break and off-topic messages when picking the last two questions", () => {
    const flagged = (index: number, flag: string): T => ({ index, role: "user", questionType: "closed", flags: [flag] });
    // closed, then a role-break: only one real weak question among the last two → no tip
    expect(selectHint([p(0), u(1, "good"), p(2), u(3, "closed"), p(4), flagged(5, "break_attempt"), p(6, "stay_in_character")], 6)).toBeNull();
    // the off-topic message is skipped, so the two closed questions around it still count
    expect(selectHint([p(0), u(1, "closed"), p(2), flagged(3, "off_topic"), p(4), u(5, "leading"), p(6)], 6)).toEqual({ kind: "open" });
  });

  it("no hint on a reply that proposes ending, even after weak questions", () => {
    expect(selectHint([p(0), u(1, "closed"), p(2), u(3, "leading"), p(4, "propose_end")], 4)).toBeNull();
  });

  it("returns null for an index that is not a persona reply", () => {
    expect(selectHint([p(0), u(1, "closed")], 1)).toBeNull();
    expect(selectHint([p(0)], 9)).toBeNull();
  });
});

describe("persona refuses to swap roles", () => {
  const guide = GuideSchema.parse(JSON.parse(readFileSync(path.join(__dirname, "..", "content", "guides", "budgeting-app.json"), "utf8")));
  const decision = (action: Decision["action"]): Decision => ({ action, reason: "", questionType: "good", flags: [], toolCalls: [] }) as unknown as Decision;
  const system = (action: Decision["action"]) => buildPersonaMessages(guide, [], decision(action), [])[0]!.content as string;

  it("always carries the 'you are the interviewee' rule, even on a plain answer", () => {
    expect(system("answer")).toMatch(/luôn là người ĐƯỢC phỏng vấn/);
    expect(system("answer")).toMatch(/đổi vai/);
  });

  it("stay_in_character covers role swaps and writing questions", () => {
    const s = system("stay_in_character");
    expect(s).toMatch(/đổi vai làm người phỏng vấn/);
    expect(s).toMatch(/không soạn, không gợi ý câu hỏi/);
  });
});
