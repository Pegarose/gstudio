import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../../config/app.config";
import { getLanguageModel, getProviderForModel } from "../../lib/ai/provider-manager";
import { modelRegistry, resolveModelRoute } from "../../lib/models/registry";
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

test("router follows a configured fallback route", () => {
  const router = createModelRouter([
    { id: "primary-code", provider: "omniroute", model: "auto/best-coding", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: ["repair-code"] },
    { id: "repair-code", provider: "omniroute", model: "auto/best-coding", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: [] },
  ]);

  assert.equal(router.fallbacksFor("primary-code", { structuredOutput: true })[0].id, "repair-code");
});

test("configured active routes do not define fallbacks", () => {
  const router = createModelRouter(modelRegistry);

  for (const route of modelRegistry) {
    assert.deepEqual(router.fallbacksFor(route.id, { structuredOutput: true }), []);
  }
});

test("configured role registry contains only OmniRoute routes", () => {
  const configuredProviders = new Set(modelRegistry.map((route) => route.provider));

  assert.deepEqual(configuredProviders, new Set(["omniroute"]));
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

test("resolveModelRoute selects the approved OmniRoute role defaults", () => {
  assert.equal(resolveModelRoute("planning").model, "auto/best-reasoning");
  assert.equal(resolveModelRoute("coder").model, "auto/best-coding");
  assert.equal(resolveModelRoute("qa").model, "auto/best-reasoning");
  assert.equal(resolveModelRoute("repair").model, "auto/best-coding");
});

test("OmniRoute language model normalizes the configured API base URL", () => {
  const previousApiBase = process.env.OMNIROUTE_API_BASE;
  const previousApiKey = process.env.OMNIROUTE_API_KEY;
  process.env.OMNIROUTE_API_BASE = "https://omniroute.tr4.net";
  process.env.OMNIROUTE_API_KEY = "test-key";

  try {
    const languageModel = getLanguageModel(resolveModelRoute("coder"));
    const internalModel = languageModel as unknown as {
      provider: string;
      config: { url: (options: { path: string }) => URL };
    };

    assert.equal(internalModel.provider, "openai.chat");
    assert.equal(
      internalModel.config.url({ path: "/chat/completions" }).toString().startsWith("https://omniroute.tr4.net/v1"),
      true,
    );
  } finally {
    if (previousApiBase === undefined) delete process.env.OMNIROUTE_API_BASE;
    else process.env.OMNIROUTE_API_BASE = previousApiBase;
    if (previousApiKey === undefined) delete process.env.OMNIROUTE_API_KEY;
    else process.env.OMNIROUTE_API_KEY = previousApiKey;
  }
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

type ModelApiConfigEntry = {
  provider: "openai";
  model: string;
  apiKey?: string;
  baseURL?: string;
};

async function legacyModelSettings(modelId: string) {
  const resolution = getProviderForModel(modelId);
  const languageModel = (resolution.client as unknown as (model: string) => unknown)(resolution.actualModel) as {
    config: { headers: () => Promise<Record<string, string | undefined>>; url: (options: { path: string }) => URL };
  };

  return { headers: await languageModel.config.headers(), url: languageModel.config.url({ path: "/responses" }).toString() };
}

test("legacy model config credentials apply when AI Gateway is absent", async () => {
  const modelId = "test-legacy-direct";
  const configs = appConfig.ai.modelApiConfig as Record<string, ModelApiConfigEntry>;
  const previousGatewayKey = process.env.AI_GATEWAY_API_KEY;
  configs[modelId] = { provider: "openai", model: "custom-model", apiKey: "legacy-route-key", baseURL: "https://legacy.example.test/v1" };
  delete process.env.AI_GATEWAY_API_KEY;

  try {
    const settings = await legacyModelSettings(modelId);
    assert.equal(settings.headers.Authorization === "Bearer legacy-route-key", true);
    assert.equal(settings.url.startsWith("https://legacy.example.test/v1"), true);
  } finally {
    delete configs[modelId];
    if (previousGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousGatewayKey;
  }
});

test("AI Gateway overrides legacy model config credentials", async () => {
  const modelId = "test-legacy-gateway";
  const configs = appConfig.ai.modelApiConfig as Record<string, ModelApiConfigEntry>;
  const previousGatewayKey = process.env.AI_GATEWAY_API_KEY;
  configs[modelId] = { provider: "openai", model: "custom-model", apiKey: "legacy-route-key", baseURL: "https://legacy.example.test/v1" };
  process.env.AI_GATEWAY_API_KEY = "gateway-key";

  try {
    const settings = await legacyModelSettings(modelId);
    assert.equal(settings.headers.Authorization === "Bearer gateway-key", true);
    assert.equal(settings.url.startsWith("https://ai-gateway.vercel.sh/v1"), true);
  } finally {
    delete configs[modelId];
    if (previousGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previousGatewayKey;
  }
});
