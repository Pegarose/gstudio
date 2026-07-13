import { redactProjectContext, type JsonValue } from "./project-context";

export interface SanitizedGenerationModelInput {
  prompt: string;
  context: JsonValue;
}

export function sanitizeGenerationModelInput(input: {
  prompt: string;
  context: JsonValue;
}): SanitizedGenerationModelInput {
  const prompt = redactProjectContext(input.prompt);
  if (typeof prompt !== "string") throw new TypeError("prompt must remain a string");
  return { prompt, context: redactProjectContext(input.context) };
}
