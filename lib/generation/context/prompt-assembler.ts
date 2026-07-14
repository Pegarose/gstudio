import { createHash } from "node:crypto";
import { loadAgentContext } from "../../gstudio-agent-context.js";
import { formatDesignPlan, formatProjectFacts, type JsonValue } from "./project-context";

type PublicGenerationMode = "clone" | "scratch" | "inspiration" | "edit";
type BaseGenerationMode = "clone" | "scratch" | "inspiration" | "inspire";

export interface AssembleSystemContextInput {
  mode: PublicGenerationMode;
  baseMode?: BaseGenerationMode;
  prompt: string;
  projectFacts: JsonValue[];
  designPlan: JsonValue | null;
}

export interface AssembledSystemContext {
  system: string;
  skills: string[];
  fingerprint: string;
}

export function assembleSystemContext({
  mode,
  baseMode,
  prompt,
  projectFacts,
  designPlan,
}: AssembleSystemContextInput): AssembledSystemContext {
  if (mode === "edit" && !baseMode) {
    throw new Error("Edit generation requires the project's recorded base mode");
  }

  const agentIntent = mode === "inspiration"
    ? "inspire"
    : mode === "edit"
      ? (baseMode === "inspiration" ? "inspire" : baseMode)
      : mode;
  const loaded = loadAgentContext({ intent: agentIntent, prompt, isEdit: mode === "edit" });
  const contextSections = [
    loaded.systemPrompt,
    loaded.skillPrompt,
    formatProjectFacts(projectFacts),
    formatDesignPlan(designPlan),
  ].filter((section): section is string => Boolean(section));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ core: loaded.systemPrompt, skills: loaded.skills, projectFacts, designPlan }))
    .digest("hex");

  return {
    system: contextSections.join("\n\n"),
    skills: loaded.skills,
    fingerprint,
  };
}
