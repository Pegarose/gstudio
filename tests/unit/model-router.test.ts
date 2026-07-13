import assert from "node:assert/strict";
import test from "node:test";
import { getLanguageModel } from "../../lib/ai/provider-manager";
import { resolveModelRoute } from "../../lib/models/registry";
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

test("preferred incompatible routes use ordered compatible fallbacks before registry order", () => {
  const router = createModelRouter([
    { id: "preferred", provider: "openai", model: "preferred", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: ["incompatible-fallback", "compatible-fallback"] },
    { id: "registry-vision", provider: "google", model: "registry-vision", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "incompatible-fallback", provider: "openai", model: "incompatible", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "compatible-fallback", provider: "google", model: "compatible", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
  ]);

  assert.equal(router.resolve({ vision: true }, "preferred").id, "compatible-fallback");
});

test("preferred incompatible routes fall back to matching registry order when their fallbacks do not match", () => {
  const router = createModelRouter([
    { id: "preferred", provider: "openai", model: "preferred", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: ["incompatible-fallback"] },
    { id: "first-registry-vision", provider: "google", model: "first", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "incompatible-fallback", provider: "openai", model: "incompatible", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "second-registry-vision", provider: "google", model: "second", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
  ]);

  assert.equal(router.resolve({ vision: true }, "preferred").id, "first-registry-vision");
});

test("resolveModelRoute selects configured defaults and preferred model names", () => {
  assert.equal(resolveModelRoute("coder").id, "opencode-code");
  assert.equal(resolveModelRoute("coder", "qwen3.7-max").id, "repair-opencode");
});

test("route credentials override environment settings when creating a language model", async () => {
  const languageModel = getLanguageModel({
    id: "custom-endpoint",
    provider: "openai",
    model: "custom-model",
    apiKey: "route-key",
    baseURL: "https://models.example.test/v1",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 10_000,
    fallbacks: [],
  });
  const internalModel = languageModel as unknown as {
    config: { headers: () => Promise<Record<string, string | undefined>>; url: (options: { path: string }) => URL };
  };

  const headers = await internalModel.config.headers();
  assert.equal(headers.Authorization === "Bearer route-key", true);
  assert.equal(internalModel.config.url({ path: "/responses" }).toString().startsWith("https://models.example.test/v1"), true);
});
