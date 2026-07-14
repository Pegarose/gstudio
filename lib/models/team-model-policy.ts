import { appConfig } from "@/config/app.config";
import type { ModelRole, ModelRoute } from "./contracts";
import { resolveModelRoute } from "./registry";

export type TeamModelRole = "planning" | "coder" | "qa";

const legacyModels: Record<TeamModelRole, Record<string, string>> = {
  planning: {
    "deepseek-v4-pro": appConfig.ai.teamModelDefaults.planning,
    "gpt-5.5": appConfig.ai.teamModelDefaults.planning,
  },
  coder: {
    "kimi-k2.7-code": appConfig.ai.teamModelDefaults.coder,
    "qwen3.7-max": appConfig.ai.teamModelDefaults.coder,
  },
  qa: {
    "deepseek-v4-pro": appConfig.ai.teamModelDefaults.qa,
    "qwen3.7-max": appConfig.ai.teamModelDefaults.qa,
  },
};

const registryRoles: Record<TeamModelRole, ModelRole> = {
  planning: "planning",
  coder: "coder",
  qa: "qa",
};

export function normalizeTeamModel(
  role: TeamModelRole,
  selectedModel: string | null | undefined,
): string {
  const mappedModel = selectedModel ? legacyModels[role][selectedModel] ?? selectedModel : undefined;
  const options = appConfig.ai.teamModelOptions[role] as readonly string[];

  return mappedModel && options.includes(mappedModel)
    ? mappedModel
    : appConfig.ai.teamModelDefaults[role];
}

export function resolveTeamModelRoute(
  role: TeamModelRole,
  selectedModel: string | null | undefined,
): ModelRoute {
  const baseRoute = resolveModelRoute(registryRoles[role]);
  const model = normalizeTeamModel(role, selectedModel);

  return { ...baseRoute, id: `${baseRoute.id}:${model}`, model, fallbacks: [] };
}
