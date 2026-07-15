import {
  generateObject,
  streamText,
  type LanguageModel,
} from "ai";
import {
  GenerationQualityError,
  GenerationValidationSchema,
  type GenerationValidation,
} from "./quality-gate";

export interface CompleteFileArtifactRecord {
  path: string;
  content: string;
}

export function parseCompleteFileArtifact(candidate: string): CompleteFileArtifactRecord[] {
  const tokenPattern = /<file path="([^"]*)">|<\/file>/g;
  let openCount = 0;
  let closeCount = 0;
  let activePath: string | null = null;
  let contentStart = 0;
  const files: CompleteFileArtifactRecord[] = [];
  const paths = new Set<string>();

  for (let token = tokenPattern.exec(candidate); token; token = tokenPattern.exec(candidate)) {
    if (token[0] === "</file>") {
      closeCount += 1;
      if (activePath === null) {
        throw new Error("File artifact contains an unmatched closing file tag");
      }

      const content = candidate.slice(contentStart, token.index).trim();
      if (!content) {
        throw new Error("File artifact contains blank file content");
      }
      if (paths.has(activePath)) {
        throw new Error("File artifact contains duplicate file paths");
      }

      paths.add(activePath);
      files.push({ path: activePath, content });
      activePath = null;
      continue;
    }

    openCount += 1;
    if (activePath !== null) {
      throw new Error("File artifact contains unmatched opening file tags");
    }

    const path = token[1].trim();
    if (!path) {
      throw new Error("File artifact contains an empty file path");
    }

    activePath = path;
    contentStart = tokenPattern.lastIndex;
  }

  if (openCount === 0) {
    throw new Error("File artifact contains no files");
  }
  if (openCount !== closeCount || activePath !== null) {
    throw new Error("File artifact contains unbalanced file tags");
  }
  if (files.length !== openCount) {
    throw new Error("File artifact contains unmatched file tags");
  }

  return files;
}

export function assertCompleteRepairArtifact(input: {
  candidate: string;
  repaired: string;
}): CompleteFileArtifactRecord[] {
  const candidateFiles = parseCompleteFileArtifact(input.candidate);
  const repairedFiles = parseCompleteFileArtifact(input.repaired);
  const candidatePaths = new Set(candidateFiles.map((file) => file.path));
  const repairedPaths = new Set(repairedFiles.map((file) => file.path));

  if (
    candidatePaths.size !== repairedPaths.size
    || [...candidatePaths].some((path) => !repairedPaths.has(path))
  ) {
    throw new Error("TR4 repair artifact must contain the same file paths as its candidate");
  }

  return repairedFiles;
}

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

export function normalizeGenerationValidation(value: unknown): GenerationValidation {
  if (!value || typeof value !== "object") {
    throw new Error("Generation review must return a JSON object");
  }

  const record = value as Record<string, unknown>;
  let findings = record.findings;
  if (typeof findings === "string") {
    try {
      findings = JSON.parse(findings);
    } catch {
      throw new Error("Generation review findings must be a JSON array");
    }
  }

  return GenerationValidationSchema.parse({ ...record, findings });
}

export async function reviewGeneratedCode({
  model,
  prompt,
  candidate,
}: ReviewInput & { model: LanguageModel }): Promise<GenerationValidation> {
  try {
    const result = await generateObject({
      model,
      schema: GenerationValidationSchema,
      messages: buildReviewMessages({ prompt, candidate }),
    });

    return normalizeGenerationValidation(result.object);
  } catch (error) {
    const text = typeof error === "object" && error !== null && "text" in error
      ? (error as { text?: unknown }).text
      : undefined;

    if (typeof text !== "string") throw error;

    try {
      return normalizeGenerationValidation(JSON.parse(text));
    } catch {
      throw error;
    }
  }
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
    maxOutputTokens: 8192,
  });

  let repairedCandidate = "";
  for await (const textPart of result.textStream) {
    repairedCandidate += textPart;
  }

  try {
    assertCompleteRepairArtifact({ candidate, repaired: repairedCandidate });
  } catch (error) {
    throw new GenerationQualityError(
      "TR4 repair model returned an incomplete file artifact",
      validation,
      1,
    );
  }

  return repairedCandidate;
}
