// Run with: node --test src/lib/hints.test.ts (native TypeScript stripping, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { HINTS_KEY, readHintsPref, writeHintsPref } from "./hints.ts";

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}
const broken = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

test("hints are on by default", () => {
  assert.equal(readHintsPref(memoryStore()), true);
  assert.equal(readHintsPref(null), true);
});

test("turning hints off is remembered", () => {
  const store = memoryStore();
  assert.equal(writeHintsPref(store, false), true);
  assert.equal(store.data.get(HINTS_KEY), "off");
  assert.equal(readHintsPref(store), false);
  writeHintsPref(store, true);
  assert.equal(readHintsPref(store), true);
});

test("blocked storage: reads as on, writes report failure, nothing throws", () => {
  assert.equal(readHintsPref(broken), true);
  assert.equal(writeHintsPref(broken, false), false);
  assert.equal(writeHintsPref(null, false), false);
});
