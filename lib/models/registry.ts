import { appConfig } from "@/config/app.config";
import type { CapabilityRequirement, ModelRole, ModelRoute } from "./contracts";
import { createModelRouter } from "./router";

export const roleRequirements: Record<ModelRole, CapabilityRequirement> = {
  intent: { structuredOutput: true, reasoning: true },
  "vision-planner": { vision: true, structuredOutput: true, reasoning: true },
  "design-planner": { structuredOutput: true, reasoning: true },
  planning: { structuredOutput: true, reasoning: true },
  coder: { structuredOutput: true, reasoning: true },
  qa: { structuredOutput: true, reasoning: true },
  repair: { structuredOutput: true, reasoning: true },
};

export const modelRegistry: readonly ModelRoute[] = appConfig.ai.modelRoutes;

const router = createModelRouter(modelRegistry);

export function resolveModelRoute(role: ModelRole, preferredModel?: string): ModelRoute {
  const preferredId = preferredModel && modelRegistry.some((route) => route.id === preferredModel)
    ? preferredModel
    : modelRegistry.find((route) => route.model === preferredModel)?.id ?? appConfig.ai.modelRoleRoutes[role];

  return router.resolve(roleRequirements[role], preferredId);
}

export { createModelRouter } from "./router";
