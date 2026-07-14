import assert from "node:assert/strict";
import test from "node:test";

test("TypeScript node:test harness executes", () => {
  assert.equal(1 + 1, 2);
});
