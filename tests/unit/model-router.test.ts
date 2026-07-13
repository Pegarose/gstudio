import assert from "node:assert/strict";
import test from "node:test";
import { createModelRouter } from "../../lib/models/router";

test("vision planning never falls back to a text-only model", () => {
  const router = createModelRouter([
    { id: "text", provider: "openai", model: "text", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "vision", provider: "google", model: "vision", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
  ]);

  assert.equal(router.resolve({ vision: true, structuredOutput: true }).id, "vision");
});

test("router throws when no route satisfies required capabilities", () => {
  const router = createModelRouter([]);

  assert.throws(() => router.resolve({ vision: true }));
});

test("OpenCode fallback can preserve a structured-output contract through Cline", () => {
  const router = createModelRouter([
    { id: "opencode-code", provider: "opencode", model: "kimi-k2.7-code", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: ["cline-code"] },
    { id: "cline-code", provider: "cline", model: "x-ai/grok-code-fast-1", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: [] },
  ]);

  assert.equal(router.fallbacksFor("opencode-code", { structuredOutput: true })[0].id, "cline-code");
});
