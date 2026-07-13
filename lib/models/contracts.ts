export interface ModelCapabilities {
  vision: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  toolUse: boolean;
}

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "groq"
  | "google"
  | "tr4"
  | "agentrouter"
  | "vercel-gateway";

export interface ModelRoute {
  id: string;
  provider: ModelProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  capabilities: ModelCapabilities;
  timeoutMs: number;
  fallbacks: string[];
}

export type ModelRole =
  | "intent"
  | "vision-planner"
  | "design-planner"
  | "planning"
  | "coder"
  | "qa"
  | "repair";
export type CapabilityRequirement = Partial<ModelCapabilities>;
