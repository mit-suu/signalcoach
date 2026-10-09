import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadContent } from "../src/services/content.service";

let mongo: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "test" });
  loadContent();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function parseSse(body: string) {
  return body
    .split("\n\n")
    .filter((b) => b.startsWith("event:"))
    .map((b) => {
      const [ev, data] = b.split("\n");
      return { event: ev!.slice(7), data: JSON.parse(data!.slice(6)) };
    });
}

let msgSeq = 0;
const ask = (agent: ReturnType<typeof request.agent>, sessionId: string, text: string) =>
  agent.post(`/api/sessions/${sessionId}/turns`).send({ text, clientMessageId: `msg-${String(++msgSeq).padStart(6, "0")}` }).expect(200);

describe("content", () => {
  it("lists 3 built-in guides without leaking signal content", async () => {
    const res = await request(app).get("/api/guides").expect(200);
    expect(res.body.guides).toHaveLength(3);
    expect(res.body.guides[0].signals).toBeUndefined();
    expect(res.body.guides[0].persona.speakingStyle).toBeUndefined();
    expect(res.body.guides[0].signalCount).toBeGreaterThanOrEqual(5);
    expect(res.body.guides[0].custom).toBe(false);
  });

  it("serves the principles library", async () => {
    const res = await request(app).get("/api/principles").expect(200);
    expect(res.body.principles.length).toBeGreaterThanOrEqual(10);
  });
});

describe("anonymous practice → register keeps history", () => {
  const agent = request.agent(app);
  let sessionId = "";

  it("starts a session without signing up (FR-12)", async () => {
    const res = await agent.post("/api/sessions").send({ guideId: "budgeting-app" }).expect(201);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/sc_token=.*HttpOnly/);
    sessionId = res.body.session.id;
    expect(res.body.session.turns[0].role).toBe("persona");
    expect(res.body.session.scorecard).toBeNull();
    expect(res.body.session.turns[0].decision).toBeUndefined(); // nothing internal while active
  });

  it("streams a persona reply over SSE and is idempotent on retry", async () => {
    const body = { text: "Kể mình nghe chị theo dõi chi tiêu thế nào?", clientMessageId: "msg-0001-abc" };
    const first = await agent.post(`/api/sessions/${sessionId}/turns`).send(body).expect(200);
    const events = parseSse(first.text);
    expect(events.map((e) => e.event)).toEqual(expect.arrayContaining(["accepted", "delta", "done"]));
    const done = events.find((e) => e.event === "done")!.data;
    expect(done.turn.role).toBe("persona");
    expect(done.signalsSurfaced).toBe(1); // mock judge proposes the first pending signal on a good question

    await agent.post(`/api/sessions/${sessionId}/turns`).send(body).expect(200);
    const s = await agent.get(`/api/sessions/${sessionId}`).expect(200);
    expect(s.body.session.turns).toHaveLength(3); // opening + 1 question + 1 reply, not duplicated
    expect(s.body.session.questionCount).toBe(1);
  });

  it("register upgrades the anonymous identity and keeps the session", async () => {
    const res = await agent
      .post("/api/auth/register")
      .send({ email: "Linh@Example.com", password: "supersecret1" })
      .expect(201);
    expect(res.body.user.email).toBe("linh@example.com");
    expect(res.body.accessToken).toBeTypeOf("string");

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.anonymous).toBe(false);
    const list = await agent.get("/api/sessions").expect(200);
    expect(list.body.sessions.map((x: { id: string }) => x.id)).toContain(sessionId);
    expect(list.body.sessions[0].guideTitle).toBe("App quản lý chi tiêu");
  });

  it("rejects duplicate email and wrong password", async () => {
    await request(app).post("/api/auth/register").send({ email: "linh@example.com", password: "supersecret1" }).expect(409);
    await request(app).post("/api/auth/login").send({ email: "linh@example.com", password: "nope-nope" }).expect(401);
  });

  it("login from a new browser merges that browser's anonymous sessions", async () => {
    const other = request.agent(app);
    const anon = await other.post("/api/sessions").send({ guideId: "fitness-app" }).expect(201);
    await other.post("/api/auth/login").send({ email: "linh@example.com", password: "supersecret1" }).expect(200);
    const list = await other.get("/api/sessions").expect(200);
    const ids = list.body.sessions.map((x: { id: string }) => x.id);
    expect(ids).toEqual(expect.arrayContaining([sessionId, anon.body.session.id]));
  });

  it("accepts the access token as a Bearer header, and hides other users' sessions", async () => {
    const login = await request(app).post("/api/auth/login").send({ email: "linh@example.com", password: "supersecret1" });
    await request(app).get(`/api/sessions/${sessionId}`).set("Authorization", `Bearer ${login.body.accessToken}`).expect(200);
    await request(app).get(`/api/sessions/${sessionId}`).expect(404); // fresh anonymous visitor
  });

  it("ends a too-short session as insufficient, with no scorecard", async () => {
    const res = await agent.post(`/api/sessions/${sessionId}/end`).expect(200);
    expect(res.body.session.status).toBe("insufficient");
    expect(res.body.session.scorecard).toBeNull();
    await agent.post(`/api/sessions/${sessionId}/turns`).send({ text: "còn nữa?", clientMessageId: "msg-0002-abc" }).expect(409);
    await agent.post(`/api/sessions/${sessionId}/scorecard`).expect(409);
  });
});

describe("full session → scorecard (agent pipeline on the mock model)", () => {
  const agent = request.agent(app);
  let sessionId = "";

  it("runs a complete interview: signals get planted, judged, and the persona proposes ending", async () => {
    const res = await agent.post("/api/sessions").send({ guideId: "project-tool" }).expect(201);
    sessionId = res.body.session.id;
    const questions = [
      "Kể mình nghe tuần vừa rồi team chị theo dõi công việc thế nào?",
      "Chuyện gì đã xảy ra với cái bảng tính đó?", // follows up → caught
      "Chị thấy tool đó hữu ích đúng không?", // leading → brief
      "Lần bàn giao gần nhất diễn ra thế nào và chị thấy sao?", // double → clarify
      "Lần bàn giao gần nhất diễn ra thế nào?",
      "Khi một dự án trễ hạn, chị biết điều đó bằng cách nào?",
      "Kể về lần gần nhất team chị đổi công cụ.",
      "Người mới vào team thì tuần đầu của họ thế nào?",
      "Sếp chị theo dõi tiến độ bằng cách nào?",
      "Điều gì khiến chị khó chịu nhất trong cách làm hiện tại?",
      "Lần gần nhất khách hàng xem board, chuyện gì đã xảy ra?",
    ];
    let lastDone: Record<string, unknown> = {};
    for (const q of questions) {
      const r = await ask(agent, sessionId, q);
      const events = parseSse(r.text);
      expect(events.at(-1)!.event).toBe("done");
      lastDone = events.at(-1)!.data as Record<string, unknown>;
    }
    expect(lastDone.signalsSurfaced).toBe(6);
    expect(lastDone.questionCount).toBe(questions.length);
  });

  it("ends the session with a self-checked scorecard; the agent log is now visible", async () => {
    const res = await agent.post(`/api/sessions/${sessionId}/end`).expect(200);
    const s = res.body.session;
    expect(s.status).toBe("complete");
    expect(s.scorecardError).toBeNull();
    expect(s.scorecard).not.toBeNull();
    expect(s.scorecard.signals).toHaveLength(6);
    expect(s.scorecard.signals.every((x: { status: string }) => x.status !== "not_surfaced")).toBe(true);
    expect(typeof s.score).toBe("number");
    expect(s.scorecard.feedback.every((f: { principleId: string }) => /^P\d\d$/.test(f.principleId))).toBe(true);
    expect(s.scorecard.focus.length).toBeGreaterThanOrEqual(1);
    // every verdict carries evidence (FR-6)
    for (const sig of s.scorecard.signals) {
      if (sig.status === "caught" || sig.status === "partial") {
        expect(sig.evidenceQuote).toBeTruthy();
        expect(s.turns[sig.evidenceTurn].text.toLowerCase()).toContain(sig.evidenceQuote.toLowerCase());
      }
    }
    // decisions and tool calls are exposed once ended (demo explainability)
    const personaTurns = s.turns.filter((t: { role: string }) => t.role === "persona").slice(1);
    expect(personaTurns.every((t: { decision: { reason: string } }) => t.decision?.reason)).toBe(true);
    expect(s.turns.some((t: { toolCalls: { name: string }[] }) => t.toolCalls?.some((c) => c.name === "seed_signal"))).toBe(true);
    const clarify = s.turns.find((t: { decision?: { action: string } }) => t.decision?.action === "clarify");
    expect(clarify).toBeDefined();
    // a second call returns the stored scorecard
    const again = await agent.post(`/api/sessions/${sessionId}/scorecard`).expect(200);
    expect(again.body.session.scorecard.generatedAt).toBe(s.scorecard.generatedAt);
  });

  it("an early end is incomplete: no score, not_surfaced signals, but feedback", async () => {
    const res = await agent.post("/api/sessions").send({ guideId: "fitness-app" }).expect(201);
    const id = res.body.session.id;
    for (const q of ["Kể tôi nghe một ngày của anh.", "Anh có thích tập sáng không?", "Lần gần nhất anh cài app, chuyện gì xảy ra?", "Anh thấy app đó hay đúng không?", "Anh tập lúc nào?", "Kể thêm đi."]) {
      await ask(agent, id, q);
    }
    const end = await agent.post(`/api/sessions/${id}/end`).expect(200);
    expect(end.body.session.status).toBe("incomplete");
    expect(end.body.session.score).toBeNull();
    expect(end.body.session.scorecard.signals.some((x: { status: string }) => x.status === "not_surfaced")).toBe(true);
    expect(end.body.session.scorecard.feedback.length).toBeGreaterThan(0);
  });
});

describe("generated guides (FR-13)", () => {
  const agent = request.agent(app);
  let guideId = "";

  it("generates, validates and saves a guide from a product brief", async () => {
    const res = await agent
      .post("/api/guides/generate")
      .send({ product: "App đặt lịch khám cho phòng khám nha khoa nhỏ", audience: "Lễ tân phòng khám 25-40 tuổi", goal: "Hiểu vì sao họ vẫn dùng sổ giấy" })
      .expect(201);
    guideId = res.body.guide.id;
    expect(res.body.guide.custom).toBe(true);
    expect(res.body.guide.signalCount).toBeGreaterThanOrEqual(5);
    expect(res.body.guide.signals).toBeUndefined();
    const list = await agent.get("/api/guides").expect(200);
    expect(list.body.guides.map((g: { id: string }) => g.id)).toContain(guideId);
    await request(app).get(`/api/guides/${guideId}`).expect(404); // other visitors can't see it
  });

  it("starts a session on it, and the session survives deleting the guide", async () => {
    const s = await agent.post("/api/sessions").send({ guideId }).expect(201);
    await agent.delete(`/api/guides/${guideId}`).expect(204);
    await agent.get(`/api/guides/${guideId}`).expect(404);
    const again = await agent.get(`/api/sessions/${s.body.session.id}`).expect(200);
    expect(again.body.session.persona.name).toBeTruthy();
    await ask(agent, s.body.session.id, "Kể mình nghe lần gần nhất chị dùng sổ giấy.");
  });

  it("rejects a brief that is too short", async () => {
    await agent.post("/api/guides/generate").send({ product: "app", audience: "ai đó" }).expect(400);
  });
});

describe("validation", () => {
  it("returns the error envelope", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "bad", password: "x" }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
