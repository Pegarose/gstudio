import "./setup";
import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireGenerationLock,
  isGenerationCancelled,
  publishGenerationEvent,
  requestGenerationCancellation,
  releaseGenerationLock,
  subscribeGenerationEvents,
} from "../../lib/generation/coordination";

process.env.REDIS_URL ??= "redis://localhost:6380";

test("only the lock owner can release a generation lock", async () => {
  const id = `test-${Date.now()}`;
  const first = await acquireGenerationLock(id, 5_000);
  const second = await acquireGenerationLock(id, 5_000);

  assert.ok(first);
  assert.equal(second, null);
  assert.equal(await releaseGenerationLock(id, "wrong-owner"), false);
  assert.equal(await releaseGenerationLock(id, first), true);
});

test("generation events use an isolated Pub/Sub connection", async () => {
  const id = `test-${Date.now()}`;
  let received: unknown;
  let resolveReceived: (() => void) | undefined;
  const receivedEvent = new Promise<void>((resolve) => {
    resolveReceived = resolve;
  });
  const unsubscribe = await subscribeGenerationEvents(id, (event) => {
    received = event;
    resolveReceived?.();
  });

  await publishGenerationEvent(id, { type: "stage", stage: "planning" });
  await receivedEvent;
  await unsubscribe();
  assert.deepEqual(received, { type: "stage", stage: "planning" });
});

test("generation cancellation persists in Redis", async () => {
  const id = `test-${Date.now()}`;
  assert.equal(await isGenerationCancelled(id), false);
  await requestGenerationCancellation(id);
  assert.equal(await isGenerationCancelled(id), true);
});
