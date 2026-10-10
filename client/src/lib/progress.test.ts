// Run with: node --test src/lib/progress.test.ts (native TypeScript stripping, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SessionSummary } from "@/types/api";
import { EMPTY_TEXT, MAX_SESSIONS, ONE_SESSION_TEXT, buildProgress } from "./progress.ts";

let seq = 0;
function session(over: Partial<SessionSummary> = {}): SessionSummary {
  seq += 1;
  return {
    id: `s${seq}`,
    guideId: "g",
    guideTitle: "App ngân sách",
    guideContext: "",
    personaName: "Lan",
    personaInitial: "L",
    status: "complete",
    startedAt: new Date(Date.UTC(2026, 0, 1) + seq * 86_400_000).toISOString(),
    endedAt: null,
    questionCount: 10,
    score: 0.5,
    counts: null,
    focus: [],
    mistakes: {},
    ...over,
  };
}

test("no ended sessions → empty message, no slots, no trend", () => {
  const p = buildProgress([session({ status: "active", score: null })]);
  assert.equal(p.slots.length, 0);
  assert.equal(p.points.length, 0);
  assert.equal(p.hint, EMPTY_TEXT);
  assert.equal(p.trend, null);
});

test("one ended session → single point + one bar, 'add one more' hint, no trend", () => {
  const p = buildProgress([session({ score: 0.72, mistakes: { leading: 1 } })]);
  assert.equal(p.slots.length, 1);
  assert.deepEqual(p.points, [{ slot: 0, pct: 72 }]);
  assert.equal(p.slots[0]!.total, 1);
  assert.equal(p.hint, ONE_SESSION_TEXT);
  assert.equal(p.caption, "1 buổi");
  assert.equal(p.trend, null);
});

test("unscored session → no point (line bridges neighbours) but a bar slot", () => {
  const a = session({ score: 0.4 });
  const b = session({ score: null, status: "incomplete", mistakes: { closed: 2 } });
  const c = session({ score: 0.6 });
  const p = buildProgress([c, b, a]); // API order is newest first
  assert.deepEqual(p.slots.map((s) => s.id), [a.id, b.id, c.id]);
  assert.deepEqual(p.points, [{ slot: 0, pct: 40 }, { slot: 2, pct: 60 }]);
  assert.equal(p.slots[1]!.pct, null);
  assert.equal(p.slots[1]!.total, 2);
  assert.equal(p.hint, null);
});

test("session with no mistakes → empty bar with total 0 (good never counts)", () => {
  const p = buildProgress([session({ mistakes: {} }), session({ mistakes: { good: 5 } })]);
  assert.deepEqual(p.slots.map((s) => s.total), [0, 0]);
  assert.deepEqual(p.slots[1]!.segments, []);
  assert.deepEqual(p.usedTypes, []);
  assert.equal(p.maxMistakes, 1);
});

test("leading ×2 + closed ×1 → two segments in fixed type order; links to the scorecard", () => {
  const s = session({ mistakes: { closed: 1, leading: 2 } });
  const p = buildProgress([s]);
  assert.deepEqual(p.slots[0]!.segments, [{ type: "leading", count: 2 }, { type: "closed", count: 1 }]);
  assert.equal(p.slots[0]!.href, `/session/${s.id}/scorecard`);
  assert.deepEqual(p.usedTypes, ["leading", "closed"]);
});

test("5 ended sessions → chronological, one point per scored session, ignores active", () => {
  const list = [0.1, 0.2, 0.3, 0.4, 0.5].map((score) => session({ score }));
  const p = buildProgress([session({ status: "active", score: null }), ...[...list].reverse()]);
  assert.deepEqual(p.points.map((x) => x.pct), [10, 20, 30, 40, 50]);
  assert.deepEqual(p.points.map((x) => x.slot), [0, 1, 2, 3, 4]);
  assert.equal(p.caption, "5 buổi");
});

test("more than 20 ended sessions → latest 20, caption says so", () => {
  const list = Array.from({ length: 25 }, () => session());
  const p = buildProgress(list);
  assert.equal(p.slots.length, MAX_SESSIONS);
  assert.equal(p.slots[0]!.id, list[5]!.id);
  assert.equal(p.slots.at(-1)!.id, list[24]!.id);
  assert.equal(p.caption, "20 buổi gần nhất");
});

test("x labels are thinned but the latest slot is always labelled", () => {
  const p = buildProgress(Array.from({ length: 20 }, () => session()));
  assert.ok(p.slots.filter((s) => s.labelDesktop).length <= 10);
  assert.ok(p.slots.filter((s) => s.labelMobile).length <= 5);
  assert.ok(p.slots.at(-1)!.labelDesktop && p.slots.at(-1)!.labelMobile);
  const few = buildProgress(Array.from({ length: 3 }, () => session()));
  assert.ok(few.slots.every((s) => s.labelDesktop && s.labelMobile));
});

test("fewer than 4 ended sessions → trend hidden", () => {
  const p = buildProgress([session({ mistakes: { leading: 1 } }), session(), session()]);
  assert.equal(p.trend, null);
});

test("≥ 4 ended sessions → per-type rate, last 3 vs earlier; zero-both types omitted", () => {
  const p = buildProgress([
    session({ questionCount: 10, mistakes: { leading: 4, vague: 1 } }), // earlier
    session({ questionCount: 10, mistakes: { closed: 1 } }), // earlier
    session({ questionCount: 10, mistakes: { leading: 1, vague: 1 } }),
    session({ questionCount: 10, mistakes: { closed: 3 } }),
    session({ questionCount: 10, mistakes: {} }),
  ]);
  assert.ok(p.trend);
  const byType = Object.fromEntries(p.trend.map((r) => [r.type, r]));
  assert.deepEqual(Object.keys(byType), ["leading", "closed", "vague"]);
  assert.equal(byType.leading!.dir, "down"); // 4/20 → 1/30
  assert.equal(byType.closed!.dir, "up"); // 1/20 → 3/30
  assert.equal(byType.vague!.dir, "down"); // 1/20 = 5% → 1/30 ≈ 3%
  assert.equal(byType.leading!.earlierRate, 0.2);
  const same = buildProgress([
    session({ mistakes: { future: 1 } }),
    session({ mistakes: { future: 1 } }),
    session({ mistakes: { future: 1 } }),
    session({ mistakes: { future: 1 } }),
  ]);
  assert.equal(same.trend![0]!.dir, "same");
});

test("trend uses all ended sessions, including those older than the 20-session window", () => {
  const old = Array.from({ length: 5 }, () => session({ questionCount: 10, mistakes: { leading: 2 } })); // outside the window
  const rest = Array.from({ length: 20 }, () => session({ questionCount: 10, mistakes: {} }));
  const p = buildProgress([...old, ...rest]);
  assert.equal(p.slots.length, MAX_SESSIONS);
  assert.ok(p.slots.every((s) => s.total === 0)); // old sessions are not charted…
  const leading = p.trend!.find((r) => r.type === "leading");
  assert.ok(leading); // …but still count as "earlier" in the trend
  assert.equal(leading.earlierRate, 10 / 220); // 5×2 mistakes over 22 earlier sessions × 10 questions
  assert.equal(leading.recentRate, 0);
  assert.equal(leading.dir, "down");
});
