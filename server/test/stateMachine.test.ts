import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeSignals, step, type SignalStateLike } from "../src/agent/stateMachine";
import type { JudgeOutput } from "../src/agent/judge";
import { GuideSchema } from "../src/types/content";
import { FOLLOW_UP_WINDOW, PLANT_DEADLINE_QUESTIONS } from "../src/types/domain";

const guide = GuideSchema.parse(JSON.parse(readFileSync(path.join(__dirname, "..", "content", "guides", "budgeting-app.json"), "utf8")));
const fresh = (): SignalStateLike[] => guide.signals.map((s) => ({ signalId: s.id, status: "pending", layer: 0, questionsSinceSeeded: 0 }));

const judge = (over: Partial<JudgeOutput> = {}): JudgeOutput => ({
  questionType: "good",
  breakAttempt: false,
  offTopic: false,
  followUp: { signalId: null, verdict: "none", confidence: 0, evidence: "" },
  plantCandidate: { signalId: null, reason: "" },
  notes: "",
  ...over,
});

const base = (over: Partial<Parameters<typeof step>[0]> = {}) => ({
  guide,
  signals: fresh(),
  questionCount: 1,
  userTurnIndex: 1,
  question: "Kể mình nghe chị theo dõi chi tiêu thế nào?",
  judge: judge(),
  lastPersonaPlanted: false,
  endProposed: false,
  ...over,
});

describe("state machine — hard rules", () => {
  it("plants the judge's candidate and records a seed_signal tool call", () => {
    const r = step(base({ judge: judge({ plantCandidate: { signalId: "mai-two-weeks", reason: "hợp" } }) }));
    expect(r.decision.action).toBe("plant_signal");
    expect(r.decision.signalId).toBe("mai-two-weeks");
    expect(r.decision.revealLayer).toBe(1);
    const s = r.signals.find((x) => x.signalId === "mai-two-weeks")!;
    expect(s.status).toBe("seeded");
    expect(s.surfacedTurn).toBe(2);
    expect(r.decision.toolCalls.map((t) => t.name)).toContain("seed_signal");
  });

  it("never plants two replies in a row early on (spacing), but does after the deadline", () => {
    const early = step(base({ lastPersonaPlanted: true, judge: judge({ plantCandidate: { signalId: "mai-two-weeks", reason: "" } }) }));
    expect(early.decision.action).toBe("answer");
    const late = step(base({ lastPersonaPlanted: true, questionCount: PLANT_DEADLINE_QUESTIONS, judge: judge({ plantCandidate: { signalId: "mai-two-weeks", reason: "" } }) }));
    expect(late.decision.action).toBe("plant_signal");
  });

  it("forces a pending signal every turn once the deadline is reached, even with no candidate", () => {
    const r = step(base({ questionCount: PLANT_DEADLINE_QUESTIONS }));
    expect(r.decision.action).toBe("plant_signal");
    expect(r.signals.filter((s) => s.status === "seeded")).toHaveLength(1);
  });

  it("a leading question still gets the signal (priority rule), but briefly", () => {
    const r = step(base({ judge: judge({ questionType: "leading", plantCandidate: { signalId: "mai-reminder", reason: "" } }) }));
    expect(r.decision.action).toBe("plant_signal");
    expect(r.decision.brief).toBe(true);
  });

  it("double-barreled → clarify, no judgment, windows frozen", () => {
    const signals = fresh();
    signals[0]!.status = "seeded";
    signals[0]!.questionsSinceSeeded = 1;
    const r = step(base({ signals, judge: judge({ questionType: "double", followUp: { signalId: signals[0]!.signalId, verdict: "caught", confidence: 0.9, evidence: "x" }, plantCandidate: { signalId: "mai-husband", reason: "" } }) }));
    expect(r.decision.action).toBe("clarify");
    expect(r.signals[0]!.status).toBe("seeded");
    expect(r.signals[0]!.questionsSinceSeeded).toBe(1);
    expect(r.signals.find((s) => s.signalId === "mai-husband")!.status).toBe("pending");
  });

  it("catches a seeded signal with evidence and unlocks the next layer on a later follow-up", () => {
    const signals = fresh();
    signals[0]!.status = "seeded";
    signals[0]!.layer = 1;
    const q = "Chuyện gì đã xảy ra sau hai tuần đó?";
    const r1 = step(base({ signals, question: q, judge: judge({ followUp: { signalId: signals[0]!.signalId, verdict: "caught", confidence: 0.95, evidence: q } }) }));
    const s1 = r1.signals[0]!;
    expect(s1.status).toBe("caught");
    expect(s1.evidenceQuote).toBe(q);
    expect(r1.decision.action).toBe("go_deeper");
    expect(r1.decision.revealLayer).toBe(2);
    expect(s1.layer).toBe(2);
    // one more real follow-up → layer 3; then no more layers → plain answer
    const r2 = step(base({ signals: r1.signals, judge: judge({ followUp: { signalId: s1.signalId, verdict: "caught", confidence: 0.9, evidence: "x" } }) }));
    expect(r2.decision.revealLayer).toBe(3);
    const r3 = step(base({ signals: r2.signals, judge: judge({ followUp: { signalId: s1.signalId, verdict: "caught", confidence: 0.9, evidence: "x" } }) }));
    expect(r3.decision.action).toBe("answer");
  });

  it("low confidence becomes unsure, never a guess", () => {
    const signals = fresh();
    signals[0]!.status = "seeded";
    const r = step(base({ signals, judge: judge({ followUp: { signalId: signals[0]!.signalId, verdict: "caught", confidence: 0.4, evidence: "x" } }) }));
    expect(r.signals[0]!.status).toBe("unsure");
  });

  it(`closes a seeded signal as missed after ${FOLLOW_UP_WINDOW} unrelated questions`, () => {
    let signals = fresh();
    signals[0]!.status = "seeded";
    for (let i = 0; i < FOLLOW_UP_WINDOW; i++) signals = step(base({ signals })).signals;
    expect(signals[0]!.status).toBe("missed");
  });

  it("partial can be upgraded within the window but not after it", () => {
    const signals = fresh();
    signals[0]!.status = "partial";
    signals[0]!.questionsSinceSeeded = FOLLOW_UP_WINDOW;
    const r = step(base({ signals, judge: judge({ followUp: { signalId: signals[0]!.signalId, verdict: "caught", confidence: 0.9, evidence: "x" } }) }));
    expect(r.signals[0]!.status).toBe("partial");
  });

  it("stays in character on a break attempt and plants nothing", () => {
    const r = step(base({ judge: judge({ breakAttempt: true, plantCandidate: { signalId: "mai-two-weeks", reason: "" } }) }));
    expect(r.decision.action).toBe("stay_in_character");
    expect(r.decision.flags).toContain("break_attempt");
    expect(r.signals.every((s) => s.status === "pending")).toBe(true);
  });

  it("proposes ending once, only when everything is out and the window is closed", () => {
    const signals = fresh().map((s) => ({ ...s, status: "caught" as const }));
    const r = step(base({ signals, questionCount: 9 }));
    expect(r.decision.action).toBe("propose_end");
    expect(r.decision.toolCalls.map((t) => t.name)).toContain("end_session");
    const again = step(base({ signals, questionCount: 10, endProposed: true }));
    expect(again.decision.action).toBe("answer");
  });

  it("closeSignals maps pending → not_surfaced and seeded → missed", () => {
    const signals = fresh();
    signals[1]!.status = "seeded";
    const { signals: out } = closeSignals(signals);
    expect(out[0]!.status).toBe("not_surfaced");
    expect(out[1]!.status).toBe("missed");
  });
});
