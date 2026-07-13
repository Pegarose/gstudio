import {
  generateObject,
  streamText,
  type LanguageModel,
} from "ai";
import {
  GenerationValidationSchema,
  type GenerationValidation,
} from "./quality-gate";

interface ReviewInput {
  prompt: string;
  candidate: string;
}

interface RepairInput {
  candidate: string;
  validation: GenerationValidation;
}

export function buildReviewMessages({ prompt, candidate }: ReviewInput): Array<{
  role: "system" | "user";
  content: string;
}> {
  return [
    {
      role: "system",
      content: "You are G Studio's blocking code validator. Mark pass=false for incomplete files, invalid imports, broken responsive behavior, missing focus states, non-tokenized design values, or fabricated metrics. Findings must be concrete and repairable.",
    },
    {
      role: "user",
      content: `ORIGINAL BRIEF:\n${prompt}\n\nGENERATED CANDIDATE:\n${candidate}`,
    },
  ];
}

export function buildRepairPrompt({ candidate, validation }: RepairInput): string {
  const findings = validation.findings
    .map((finding) => `- ${finding.file ?? "project"}: ${finding.repairInstruction}`)
    .join("\n");

  return `Repair every finding below. Return the complete corrected candidate using <file path="...">...</file> for every file. Do not include commentary or partial files.

FINDINGS:
${findings}

ORIGINAL CANDIDATE:
${candidate}`;
}

export async function reviewGeneratedCode({
  model,
  prompt,
  candidate,
}: ReviewInput & { model: LanguageModel }): Promise<GenerationValidation> {
  const result = await generateObject({
    model,
    schema: GenerationValidationSchema,
    messages: buildReviewMessages({ prompt, candidate }),
  });

  return result.object;
}

export async function repairGeneratedCode({
  model,
  candidate,
  validation,
}: RepairInput & { model: LanguageModel }): Promise<string> {
  const result = streamText({
    model,
    system: "You are G Studio's code repair agent. Return only complete repaired file artifacts.",
    prompt: buildRepairPrompt({ candidate, validation }),
  });

  let repairedCandidate = "";
  for await (const textPart of result.textStream) {
    repairedCandidate += textPart;
  }

  if (!repairedCandidate.includes('<file path="') || !repairedCandidate.includes("</file>")) {
    throw new Error("TR4 repair model returned an invalid file artifact");
  }

  return repairedCandidate;
}
