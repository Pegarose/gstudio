import { appConfig } from '@/config/app.config';
import type { ModelProvider, ModelRoute } from '@/lib/models/contracts';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type ProviderClient =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createGroq>
  | ReturnType<typeof createGoogleGenerativeAI>;

export interface ProviderResolution {
  client: ProviderClient;
  actualModel: string;
}

const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';
const clientCache = new Map<string, ProviderClient>();

function withV1Suffix(baseURL: string | undefined): string | undefined {
  if (!baseURL || baseURL.endsWith('/v1') || baseURL.endsWith('/v1/')) return baseURL;
  return `${baseURL.replace(/\/$/, '')}/v1`;
}

function getProviderSettings(
  provider: ModelProvider,
  overrides: Pick<ModelRoute, 'apiKey' | 'baseURL'> = {},
): { apiKey?: string; baseURL?: string } {
  const defaults = (() => {
  switch (provider) {
    case 'openai':
      return { apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY, baseURL: process.env.AI_GATEWAY_API_KEY ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL };
    case 'anthropic':
      return { apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY, baseURL: process.env.AI_GATEWAY_API_KEY ? aiGatewayBaseURL : process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1' };
    case 'groq':
      return { apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY, baseURL: process.env.AI_GATEWAY_API_KEY ? aiGatewayBaseURL : process.env.GROQ_BASE_URL };
    case 'google':
      return { apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY, baseURL: process.env.AI_GATEWAY_API_KEY ? aiGatewayBaseURL : process.env.GEMINI_BASE_URL };
    case 'opencode':
      return { apiKey: process.env.OPENCODEGO_API_KEY, baseURL: withV1Suffix(process.env.OPENCODEGO_API_BASE) };
    case 'tr4':
      return { apiKey: process.env.TR4_API_KEY, baseURL: withV1Suffix(process.env.TR4_API_BASE) };
    case 'agentrouter':
      return { apiKey: process.env.AGENTROUTER_API_KEY, baseURL: withV1Suffix(process.env.AGENTROUTER_API_BASE) };
    case 'vercel-gateway':
      return { apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: aiGatewayBaseURL };
  }
  })();

  return {
    apiKey: overrides.apiKey ?? defaults.apiKey,
    baseURL: overrides.baseURL ?? defaults.baseURL,
  };
}

function getOrCreateClient(provider: ModelProvider, overrides: Pick<ModelRoute, 'apiKey' | 'baseURL'> = {}): ProviderClient {
  const { apiKey, baseURL } = getProviderSettings(provider, overrides);
  const cacheKey = `${provider}:${apiKey ?? ''}:${baseURL ?? ''}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  let client: ProviderClient;
  switch (provider) {
    case 'anthropic':
      client = createAnthropic({ apiKey, baseURL });
      break;
    case 'groq':
      client = createGroq({ apiKey, baseURL });
      break;
    case 'google':
      client = createGoogleGenerativeAI({ apiKey, baseURL });
      break;
    default:
      client = createOpenAI({ apiKey, baseURL });
  }

  clientCache.set(cacheKey, client);
  return client;
}

export function getProviderForRoute(route: ModelRoute): ProviderResolution {
  return { client: getOrCreateClient(route.provider, route), actualModel: route.model };
}

export function getLanguageModel(route: ModelRoute): LanguageModel {
  const { client, actualModel } = getProviderForRoute(route);
  return (client as unknown as (modelId: string) => LanguageModel)(actualModel);
}

function legacyRouteForModel(modelId: string): ModelRoute {
  const configured = appConfig.ai.modelApiConfig?.[modelId as keyof typeof appConfig.ai.modelApiConfig] as {
    provider: ModelProvider;
    model: string;
    apiKey?: string;
    baseURL?: string;
  } | undefined;
  if (configured) {
    const legacyOverrides = process.env.AI_GATEWAY_API_KEY
      ? {}
      : { apiKey: configured.apiKey, baseURL: configured.baseURL };

    return { id: `legacy:${modelId}`, provider: configured.provider, model: configured.model, ...legacyOverrides, capabilities: { vision: false, structuredOutput: false, reasoning: false, toolUse: false }, timeoutMs: 45_000, fallbacks: [] };
  }

  if (modelId === 'moonshotai/kimi-k2-instruct-0905') return legacyModelRoute(modelId, 'groq');
  if (modelId.startsWith('anthropic/')) return legacyModelRoute(modelId.replace('anthropic/', ''), 'anthropic');
  if (modelId.startsWith('openai/')) return legacyModelRoute(modelId.replace('openai/', ''), 'openai');
  if (modelId.startsWith('google/')) return legacyModelRoute(modelId.replace('google/', ''), 'google');
  return legacyModelRoute(modelId, 'groq');
}

function legacyModelRoute(model: string, provider: ModelProvider): ModelRoute {
  return { id: `legacy:${provider}:${model}`, provider, model, capabilities: { vision: false, structuredOutput: false, reasoning: false, toolUse: false }, timeoutMs: 45_000, fallbacks: [] };
}

/** Compatibility wrapper for callers that still pass legacy model IDs. */
export function getProviderForModel(modelId: string): ProviderResolution {
  return getProviderForRoute(legacyRouteForModel(modelId));
}

export default getProviderForModel;
