import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { listSampleTranscripts, loadContent } from "../src/services/content.service";
import { parseSpeakerLine, parseTranscript } from "../src/agent/transcriptParser";
import { analyzeTranscript, parseAnalysisItems, selfCheckTranscript, type AnalysisOutput } from "../src/agent/transcriptAnalyzer";
import { norm, quoteIn } from "../src/agent/textMatch";
import { llm, LlmUnavailableError } from "../src/lib/llm";

let mongo: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "test-transcripts" });
  loadContent();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const SHORT = ["Minh: Chị dùng app thế nào?", "Lan: Mình ghi mỗi tối.", "Minh: Kể mình nghe tối qua?", "Lan: Tối qua quên."].join("\n");

// ─────────────────────────────────────────────────────────────────────────────
// Parser (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("transcript parser", () => {
  it("splits `Tên: nội dung` lines into turns and lists speakers in order", () => {
    const { turns, speakers } = parseTranscript("Minh: Chào chị.\nChị Lan: Chào em.\nMinh: Kể mình nghe…");
    expect(speakers).toEqual(["Minh", "Chị Lan"]);
    expect(turns).toEqual([
      { index: 0, speaker: "Minh", text: "Chào chị." },
      { index: 1, speaker: "Chị Lan", text: "Chào em." },
      { index: 2, speaker: "Minh", text: "Kể mình nghe…" },
    ]);
  });

  it("appends continuation lines to the previous turn and merges same-speaker lines", () => {
    const { turns } = parseTranscript("Minh: Câu một\nvẫn câu một\n\nMinh: câu hai\nLan: trả lời");
    expect(turns).toHaveLength(2);
    expect(turns[0]!.text).toBe("Câu một\nvẫn câu một\ncâu hai");
    expect(turns[1]).toEqual({ index: 1, speaker: "Lan", text: "trả lời" });
  });

  it("ignores timestamps, CRLF, preamble, full-width colons and speaker case", () => {
    const { turns, speakers } = parseTranscript("Phỏng vấn ngày 3/10\r\n[00:01:02] Minh: hỏi\r\n00:12 LAN：đáp\r\nlan: thêm\r\n- minh: hỏi tiếp");
    expect(speakers).toEqual(["Minh", "LAN"]);
    expect(turns.map((t) => t.text)).toEqual(["hỏi", "đáp\nthêm", "hỏi tiếp"]);
  });

  it("does not take a sentence with a colon for a speaker", () => {
    expect(parseSpeakerLine("Hôm đó mình nghĩ thế này thật ra là: thôi kệ")).toBeNull();
    expect(parseSpeakerLine("Lan: giờ là 10:30")).toEqual({ speaker: "Lan", text: "giờ là 10:30" });
  });

  it("a label-only line starts a turn filled by continuation lines (client lib/transcript.ts mirrors these cases)", () => {
    const a = parseTranscript("Minh:\nhỏi một\nLan:\nđáp\nMinh:\nhỏi hai");
    expect(a.turns.map((t) => [t.speaker, t.text])).toEqual([["Minh", "hỏi một"], ["Lan", "đáp"], ["Minh", "hỏi hai"]]);
    const b = parseTranscript("Minh: a\nLan:\ncontinuation\nMinh: b");
    expect(b.turns.map((t) => t.speaker)).toEqual(["Minh", "Lan", "Minh"]);
    const c = parseTranscript("Minh: a\nLan:\nMinh: b\nLan: c");
    expect(c.turns.map((t) => [t.speaker, t.text])).toEqual([["Minh", "a\nb"], ["Lan", "c"]]);
  });

  it("finds fewer than two speakers in unprefixed text", () => {
    expect(parseTranscript("chỉ là một đoạn văn\nkhông có tên người nói").speakers).toHaveLength(0);
    expect(parseTranscript("Minh: một mình\nMinh: vẫn mình").speakers).toEqual(["Minh"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Self-check (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("transcript self-check", () => {
  const { turns } = parseTranscript(
    [
      "Minh: Kể mình nghe chị ghi chi tiêu thế nào?", // 0
      "Lan: Mình ghi mỗi tối. Thật ra mình ngại mở app lắm.", // 1
      "Minh: Chị dùng app lâu chưa?", // 2
      "Lan: Năm tháng. Chồng mình cài cho.", // 3
      "Minh: Chị thấy tiện đúng không?", // 4
      "Lan: Tiện.", // 5
      "Minh: Chồng chị cài cho chị lúc nào, kể mình nghe?", // 6
      "Lan: Tháng năm.", // 7
    ].join("\n"),
  );
  const base = { kind: "emotion" as const, label: "", followUpQuote: "", suggestedQuestion: "", note: "" };
  const run = (out: Partial<AnalysisOutput>) => selfCheckTranscript(turns, "Minh", { signals: [], feedback: [], summary: "", ...out });

  it("drops a signal whose quote is not verbatim in the cited interviewee turn", () => {
    const { result, log } = run({ signals: [{ ...base, turnIndex: 1, quote: "mình sợ mở app", status: "missed", followUpTurn: null }] });
    expect(result.signals).toHaveLength(0);
    expect(log[0]!.check).toMatch(/not verbatim/);
  });

  it("drops a signal cited on my own turn or a non-existent turn", () => {
    const { result, log } = run({
      signals: [
        { ...base, turnIndex: 0, quote: "chị ghi chi tiêu", status: "missed", followUpTurn: null },
        { ...base, turnIndex: 99, quote: "x", status: "missed", followUpTurn: null },
      ],
    });
    expect(result.signals).toHaveLength(0);
    expect(log.map((l) => l.check)).toEqual(["signal must come from the interviewee", "cited turn does not exist"]);
  });

  it("keeps a verbatim quote even with different punctuation/case, and adds a suggested question when missed", () => {
    const { result } = run({ signals: [{ ...base, turnIndex: 1, quote: "thật ra mình ngại mở app lắm", status: "missed", followUpTurn: null }] });
    expect(result.signals[0]!.status).toBe("missed");
    expect(result.signals[0]!.suggestedQuestion).toContain("thật ra mình ngại mở app lắm");
    expect(result.counts).toEqual({ caught: 0, partial: 0, missed: 1, total: 1 });
  });

  it("downgrades caught to missed when the follow-up is outside my next 2 turns or not mine", () => {
    const { result, log } = run({
      signals: [
        { ...base, kind: "behavior", turnIndex: 3, quote: "Chồng mình cài cho.", status: "caught", followUpTurn: 6, followUpQuote: "Chồng chị cài cho chị lúc nào" }, // window is #4, #6 → ok
        { ...base, turnIndex: 1, quote: "ngại mở app", status: "caught", followUpTurn: 6, followUpQuote: "Chồng chị" }, // window is #2, #4
        { ...base, turnIndex: 1, quote: "Mình ghi mỗi tối", status: "partial", followUpTurn: 3, followUpQuote: "Năm tháng" }, // not mine
      ],
    });
    const byQuote = new Map(result.signals.map((s) => [s.quote, s]));
    expect(byQuote.get("Chồng mình cài cho.")!.status).toBe("caught");
    expect(byQuote.get("Chồng mình cài cho.")!.followUpTurn).toBe(6);
    expect(byQuote.get("Chồng mình cài cho.")!.suggestedQuestion).toBeNull();
    expect(byQuote.get("ngại mở app")!.status).toBe("missed");
    expect(byQuote.get("ngại mở app")!.followUpTurn).toBeNull();
    expect(byQuote.get("Mình ghi mỗi tối")!.status).toBe("missed");
    expect(log.map((l) => l.check)).toEqual(expect.arrayContaining(["follow-up outside the window", "follow-up turn is not mine"]));
  });

  it("caught with no evidence becomes missed; a non-verbatim follow-up quote is repaired", () => {
    const { result } = run({
      signals: [
        { ...base, turnIndex: 1, quote: "ngại mở app", status: "caught", followUpTurn: null },
        { ...base, turnIndex: 3, quote: "Chồng mình cài cho", status: "caught", followUpTurn: 4, followUpQuote: "bịa ra" },
      ],
    });
    expect(result.signals[0]!.status).toBe("missed");
    expect(result.signals[1]!.followUpQuote).toBe(turns[4]!.text);
  });

  it("keeps feedback only on my turns, mapped to a principle, with a rewrite", () => {
    const { result, log } = run({
      feedback: [
        { turnIndex: 4, type: "leading", rewrite: "Lần gần nhất chị dùng app thế nào?", impact: 3 },
        { turnIndex: 1, type: "closed", rewrite: "x", impact: 1 },
        { turnIndex: 2, type: "closed", rewrite: "", impact: 1 },
        { turnIndex: 0, type: "good", rewrite: "x", impact: 1 },
      ],
    });
    expect(result.feedback).toHaveLength(1);
    expect(result.feedback[0]).toMatchObject({ turnIndex: 4, type: "leading", principleId: "P03", original: turns[4]!.text });
    expect(log.map((l) => l.check)).toEqual(["turn is not my question", "feedback has no rewrite", "a good question is not a mistake"]);
  });

  it("replaces a suggested question that repeats one I asked (≥0.7 similar) with the fallback, and logs it", () => {
    const { result, log } = run({ signals: [{ ...base, turnIndex: 1, quote: "ngại mở app", status: "missed", followUpTurn: null, suggestedQuestion: "Chị dùng app lâu chưa?" }] });
    expect(result.signals[0]!.suggestedQuestion).not.toBe("Chị dùng app lâu chưa?");
    expect(result.signals[0]!.suggestedQuestion).toContain("ngại mở app");
    expect(log.some((l) => l.target === "signal:#1" && l.check.includes("duplicates"))).toBe(true);
  });

  it("orders feedback by impact desc, then turn order", () => {
    const { result } = run({
      feedback: [
        { turnIndex: 6, type: "vague", rewrite: "r", impact: 1 },
        { turnIndex: 4, type: "leading", rewrite: "r", impact: 3 },
        { turnIndex: 2, type: "closed", rewrite: "r", impact: 1 },
        { turnIndex: 0, type: "double", rewrite: "r", impact: 3 },
      ],
    });
    expect(result.feedback.map((f) => f.turnIndex)).toEqual([0, 4, 2, 6]);
  });

  it("drops a punctuation-only quote", () => {
    expect(quoteIn("…", "Hồi đầu ghi đều lắm, giờ thì… cũng tuỳ hôm.")).toBe(false);
    expect(quoteIn(" ... ", "a... b")).toBe(false);
    expect(quoteIn("giờ thì…", "Hồi đầu ghi đều lắm, giờ thì… cũng tuỳ hôm.")).toBe(true);
    const { result, log } = run({ signals: [{ ...base, turnIndex: 1, quote: "…", status: "missed", followUpTurn: null }] });
    expect(result.signals).toHaveLength(0);
    expect(log[0]!.check).toMatch(/not verbatim/);
  });

  it("logs every other drop: duplicate signal, duplicate feedback, over the limits", () => {
    const sig = { ...base, turnIndex: 1, quote: "ngại mở app", status: "missed" as const, followUpTurn: null };
    const dup = run({ signals: [sig, { ...sig, quote: "Ngại mở app!" }], feedback: [{ turnIndex: 4, type: "leading", rewrite: "r", impact: 2 }, { turnIndex: 4, type: "closed", rewrite: "r", impact: 2 }] });
    expect(dup.result.signals).toHaveLength(1);
    expect(dup.result.feedback).toHaveLength(1);
    expect(dup.log.map((l) => l.check)).toEqual(expect.arrayContaining(["duplicate signal", "duplicate feedback for this turn"]));

    // A longer transcript: 13 valid signals (limit 12) and 11 feedback items (limit 10).
    const long = parseTranscript(Array.from({ length: 30 }, (_, i) => (i % 2 ? `Lan: câu trả lời số ${i} ở đây` : `Minh: câu hỏi số ${i} ở đây?`)).join("\n")).turns;
    const over = selfCheckTranscript(long, "Minh", {
      signals: Array.from({ length: 13 }, (_, k) => ({ ...base, turnIndex: 2 * k + 1, quote: `câu trả lời số ${2 * k + 1}`, status: "missed" as const, followUpTurn: null })),
      feedback: Array.from({ length: 11 }, (_, k) => ({ turnIndex: 2 * k, type: "vague" as const, rewrite: "r", impact: 1 })),
      summary: "",
    });
    expect(over.result.signals).toHaveLength(12);
    expect(over.result.feedback).toHaveLength(10);
    expect(over.log.map((l) => l.check)).toEqual(expect.arrayContaining(["too many signals", "too much feedback"]));
  });
});

describe("per-item validation of the model output", () => {
  const { turns } = parseTranscript(
    ["Minh: Kể mình nghe chị ghi chi tiêu thế nào?", "Lan: Thật ra mình ngại mở app lắm.", "Minh: Chị thấy tiện đúng không?", "Lan: Tiện.", "Minh: Chị dùng lâu chưa?", "Lan: Lâu.", "Minh: Còn gì nữa không?"].join("\n"),
  );

  it("clamps impact into 1–3 and drops only the items that still fail, logging each drop", () => {
    const { output, log } = parseAnalysisItems({
      signals: [
        { turnIndex: 1, quote: "ngại mở app", kind: "emotion", label: "", status: "missed", followUpTurn: null, followUpQuote: "", suggestedQuestion: "", note: "" },
        { turnIndex: 1, quote: "Thật ra", kind: "sarcasm", label: "", status: "missed", followUpTurn: null, followUpQuote: "", suggestedQuestion: "", note: "" },
      ],
      feedback: [
        { turnIndex: 2, type: "leading", rewrite: "r", impact: 0 },
        { turnIndex: 4, type: "closed", rewrite: "r", impact: 4 },
        { turnIndex: 6, type: "nonsense", rewrite: "r", impact: 2 },
      ],
      summary: "",
    });
    expect(output.signals).toHaveLength(1);
    expect(output.feedback.map((f) => f.impact)).toEqual([1, 3]);
    expect(log.map((l) => l.target)).toEqual(["signal:#1", "feedback:#6"]);
    expect(log.every((l) => l.check === "item failed schema validation" && !l.before.includes("sarcasm"))).toBe(true);
  });

  it("one bad item no longer fails the whole analysis", async () => {
    const spy = vi.spyOn(llm, "completeJson").mockResolvedValue(
      JSON.stringify({
        signals: [{ turnIndex: 1, quote: "ngại mở app", kind: "unknown-kind", status: "missed" }, { turnIndex: 1, quote: "ngại mở app", kind: "emotion", status: "missed", followUpTurn: null }],
        feedback: [{ turnIndex: 2, type: "leading", rewrite: "Lần gần nhất thì sao?", impact: 9 }],
        summary: "ok",
      }),
    );
    const { result, log } = await analyzeTranscript(turns, "Minh");
    spy.mockRestore();
    expect(result.signals).toHaveLength(1);
    expect(result.feedback[0]!.impact).toBe(3);
    expect(log.some((l) => l.check === "item failed schema validation")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Samples: parse and analyse end to end on the mock, matching their known answers
// ─────────────────────────────────────────────────────────────────────────────

describe("sample transcripts", () => {
  const samples = () => listSampleTranscripts();

  it("ships 2–3 Vietnamese samples of 12–20 turns with ≥2 missed, ≥1 caught, ≥2 mistakes", () => {
    expect(samples().length).toBeGreaterThanOrEqual(2);
    expect(samples().length).toBeLessThanOrEqual(3);
    for (const s of samples()) {
      const { turns, speakers } = parseTranscript(s.text);
      expect(turns.length).toBeGreaterThanOrEqual(12);
      expect(turns.length).toBeLessThanOrEqual(20);
      expect(speakers).toContain(s.me);
      expect(s.expected.signals.filter((x) => x.status === "missed").length).toBeGreaterThanOrEqual(2);
      expect(s.expected.signals.filter((x) => x.status === "caught").length).toBeGreaterThanOrEqual(1);
      expect(s.expected.mistakes.length).toBeGreaterThanOrEqual(2);
      for (const m of s.expected.mistakes) expect(turns[m.turn]!.speaker).toBe(s.me);
      for (const x of s.expected.signals) expect(turns[x.turn]!.speaker).not.toBe(s.me);
    }
  });

  it("analyses each sample on the mock and finds the expected signals and mistakes", async () => {
    for (const s of samples()) {
      const { turns } = parseTranscript(s.text);
      const { result } = await analyzeTranscript(turns, s.me);
      for (const x of s.expected.signals) {
        const found = result.signals.find((r) => r.turnIndex === x.turn && (norm(r.quote).includes(norm(x.quote)) || norm(x.quote).includes(norm(r.quote))));
        expect(found, `${s.id} #${x.turn}`).toBeDefined();
        expect(found!.status, `${s.id} #${x.turn}`).toBe(x.status);
        expect(norm(turns[x.turn]!.text)).toContain(norm(found!.quote));
        if (x.status === "missed") expect(found!.suggestedQuestion).toBeTruthy();
      }
      for (const m of s.expected.mistakes) {
        expect(result.feedback.find((f) => f.turnIndex === m.turn)?.type, `${s.id} #${m.turn}`).toBe(m.type);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

describe("transcripts API", () => {
  const agent = request.agent(app);
  let id = "";

  it("serves the samples without their known answers", async () => {
    const res = await agent.get("/api/transcripts/samples").expect(200);
    expect(res.body.samples.length).toBeGreaterThanOrEqual(2);
    expect(res.body.samples[0].text).toContain(":");
    expect(res.body.samples[0].me).toBeTruthy();
    expect(res.body.samples[0].expected).toBeUndefined();
  });

  it("analyses a sample for an anonymous visitor: a missed signal with a verbatim quote and a suggested question", async () => {
    const sample = (await agent.get("/api/transcripts/samples")).body.samples[0];
    const res = await agent.post("/api/transcripts").send({ text: sample.text, me: sample.me }).expect(201);
    const a = res.body.analysis;
    id = a.id;
    expect(a.title).toMatch(/^Phỏng vấn \S+ · \d{2}\/\d{2}\/\d{4}$/);
    expect(a.me).toBe(sample.me);
    const missed = a.result.signals.filter((s: { status: string }) => s.status === "missed");
    expect(missed.length).toBeGreaterThan(0);
    for (const s of missed) {
      expect(norm(a.turns[s.turnIndex].text)).toContain(norm(s.quote));
      expect(s.suggestedQuestion).toBeTruthy();
    }
    expect(a.result.feedback.length).toBeGreaterThan(0);
    expect(a.result.score).toBeUndefined(); // counts only
    expect(a.result.counts.total).toBe(a.result.signals.length);
  });

  it("uses a custom title and matches `me` case-insensitively", async () => {
    const sample = (await agent.get("/api/transcripts/samples")).body.samples[1];
    const res = await agent.post("/api/transcripts").send({ text: sample.text, me: sample.me.toUpperCase(), title: "Buổi thứ hai" }).expect(201);
    expect(res.body.analysis.title).toBe("Buổi thứ hai");
    expect(res.body.analysis.me).toBe(sample.me);
    await agent.delete(`/api/transcripts/${res.body.analysis.id}`).expect(204);
  });

  it("lists, re-reads and hides it from other visitors", async () => {
    const list = await agent.get("/api/transcripts").expect(200);
    expect(list.body.analyses.map((x: { id: string }) => x.id)).toEqual([id]);
    expect(list.body.analyses[0].counts.missed).toBeGreaterThan(0);
    expect(list.body.analyses[0].turns).toBeUndefined();
    const one = await agent.get(`/api/transcripts/${id}`).expect(200);
    expect(one.body.analysis.turns.length).toBeGreaterThanOrEqual(12);
    await request(app).get(`/api/transcripts/${id}`).expect(404);
    await request(app).delete(`/api/transcripts/${id}`).expect(404);
    await agent.get("/api/transcripts/not-an-id").expect(404);
  });

  it("rejects text with fewer than two speakers before any model call", async () => {
    const spy = vi.spyOn(llm, "completeJson");
    const res = await agent.post("/api/transcripts").send({ text: "chỉ là ghi chú\nkhông có ai nói", me: "Minh" }).expect(400);
    expect(res.body.error.code).toBe("TRANSCRIPT_UNPARSEABLE");
    expect(res.body.error.message).toMatch(/Tên|tên người nói/);
    const one = await agent.post("/api/transcripts").send({ text: "Minh: a\nMinh: b", me: "Minh" }).expect(400);
    expect(one.body.error.code).toBe("TRANSCRIPT_UNPARSEABLE");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects fewer than 4 turns by me, and an unknown me, before any model call", async () => {
    const spy = vi.spyOn(llm, "completeJson");
    const short = await agent.post("/api/transcripts").send({ text: SHORT, me: "Minh" }).expect(400);
    expect(short.body.error.code).toBe("TRANSCRIPT_TOO_SHORT");
    const unknown = await agent.post("/api/transcripts").send({ text: SHORT, me: "Hùng" }).expect(400);
    expect(unknown.body.error.code).toBe("VALIDATION_ERROR");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects text over 30 000 characters (and accepts a body that large)", async () => {
    const res = await agent.post("/api/transcripts").send({ text: "Minh: " + "ạ".repeat(30_001), me: "Minh" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a retryable 503 and saves nothing when the model is down", async () => {
    const sample = (await agent.get("/api/transcripts/samples")).body.samples[0];
    const spy = vi.spyOn(llm, "completeJson").mockRejectedValue(new LlmUnavailableError("down"));
    const res = await agent.post("/api/transcripts").send({ text: sample.text, me: sample.me }).expect(503);
    expect(res.body.error.code).toBe("LLM_UNAVAILABLE");
    expect(res.body.error.details.retryable).toBe(true);
    spy.mockRestore();
    const list = await agent.get("/api/transcripts").expect(200);
    expect(list.body.analyses).toHaveLength(1);
  });

  it("moves anonymous analyses onto the account at login", async () => {
    await request(app).post("/api/auth/register").send({ email: "transcripts@example.com", password: "supersecret1" }).expect(201);
    await agent.post("/api/auth/login").send({ email: "transcripts@example.com", password: "supersecret1" }).expect(200);
    const list = await agent.get("/api/transcripts").expect(200);
    expect(list.body.analyses.map((x: { id: string }) => x.id)).toContain(id);
    const login = await request(app).post("/api/auth/login").send({ email: "transcripts@example.com", password: "supersecret1" });
    await request(app).get(`/api/transcripts/${id}`).set("Authorization", `Bearer ${login.body.accessToken}`).expect(200);
  });

  it("“Xoá lịch sử” deletes analyses too; single delete works", async () => {
    const sample = (await agent.get("/api/transcripts/samples")).body.samples[0];
    const extra = await agent.post("/api/transcripts").send({ text: sample.text, me: sample.me }).expect(201);
    await agent.delete(`/api/transcripts/${extra.body.analysis.id}`).expect(204);
    await agent.get(`/api/transcripts/${extra.body.analysis.id}`).expect(404);
    const res = await agent.delete("/api/sessions").expect(200);
    expect(res.body.analysesDeleted).toBe(1);
    const list = await agent.get("/api/transcripts").expect(200);
    expect(list.body.analyses).toHaveLength(0);
  });
});
