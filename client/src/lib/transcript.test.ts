// Run with: node --test src/lib/transcript.test.ts (native TypeScript stripping, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectSpeakers } from "./transcript.ts";

test("detects speakers in order with their turn counts", () => {
  const s = detectSpeakers("Minh: Chào chị.\nChị Lan: Chào em.\ntiếp tục câu\nMinh: Kể mình nghe…\nMinh: thêm nữa\nchị lan: Ừ.");
  assert.deepEqual(s, [
    { name: "Minh", turns: 2 },
    { name: "Chị Lan", turns: 2 },
  ]);
});

test("ignores timestamps and lines that are sentences with a colon", () => {
  const s = detectSpeakers("[00:01:02] Minh: hỏi\n00:12 Lan：đáp\nHôm đó mình nghĩ thế này thật ra là: thôi kệ");
  assert.deepEqual(s.map((x) => x.name), ["Minh", "Lan"]);
});

test("plain text has no speakers", () => {
  assert.equal(detectSpeakers("chỉ là một đoạn văn\nkhông có tên").length, 0);
});

test("a label-only line starts a turn that continuation lines fill (same as the server parser)", () => {
  assert.deepEqual(detectSpeakers("Minh:\nhỏi một\nLan:\nđáp\nMinh:\nhỏi hai"), [
    { name: "Minh", turns: 2 },
    { name: "Lan", turns: 1 },
  ]);
  assert.deepEqual(detectSpeakers("Minh: a\nLan:\ncontinuation\nMinh: b"), [
    { name: "Minh", turns: 2 },
    { name: "Lan", turns: 1 },
  ]);
});

test("an empty speaker turn is dropped and its neighbours merge", () => {
  assert.deepEqual(detectSpeakers("Minh: a\nLan:\nMinh: b\nLan: c"), [
    { name: "Minh", turns: 1 },
    { name: "Lan", turns: 1 },
  ]);
});
