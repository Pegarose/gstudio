import { z } from "zod";

export const GenerationValidationSchema = z.object({
  pass: z.boolean(),
  summary: z.string().min(1),
  findings: z.array(
    z.object({
      severity: z.enum(["blocking", "warning"]),
      category: z.enum([
        "correctness",
        "completeness",
        "imports",
        "responsive",
        "accessibility",
        "design-tokens",
        "honest-content",
      ]),
      file: z.string().nullable(),
      message: z.string().min(1),
      repairInstruction: z.string().min(1),
    }),
  ),
});

export type GenerationValidation = z.infer<typeof GenerationValidationSchema>;
export type QualityGateStage = "validating" | "repairing";

export interface QualityGateResult {
  candidate: string;
  validation: GenerationValidation;
  repairCount: number;
}

export class GenerationQualityError extends Error {
  constructor(
    message: string,
    public readonly validation: GenerationValidation,
    public readonly repairCount: number,
  ) {
    super(message);
    this.name = "GenerationQualityError";
  }
}

export async function runGenerationQualityGate(input: {
  candidate: string;
  review: (candidate: string) => Promise<GenerationValidation>;
  repair: (
    candidate: string,
    validation: GenerationValidation,
  ) => Promise<string>;
  onStage?: (
    stage: QualityGateStage,
    repairCount: number,
  ) => Promise<void> | void;
  maxRepairs?: number;
}): Promise<QualityGateResult> {
  const maxRepairs = input.maxRepairs ?? 1;
  let candidate = input.candidate;
  let repairCount = 0;

  await input.onStage?.("validating", repairCount);
  let validation = await input.review(candidate);

  while (!validation.pass && repairCount < maxRepairs) {
    await input.onStage?.("repairing", repairCount);
    candidate = await input.repair(candidate, validation);
    repairCount += 1;
    await input.onStage?.("validating", repairCount);
    validation = await input.review(candidate);
  }

  if (!validation.pass) {
    throw new GenerationQualityError(
      validation.summary,
      validation,
      repairCount,
    );
  }

  return { candidate, validation, repairCount };
}
