import { z } from "zod";
import {
  GenerationArtifactSchema,
  type GenerationArtifact,
} from "../contracts/validation";
import { PACKAGE_NAME } from "../validation/dependency-validator";
import type { RepairContext } from "./repair-context";

const SAFE_GENERATED_FILE_PATH = /^(?:src|public)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface RepairPatchGenerator {
  generatePatch(context: RepairContext): Promise<GenerationArtifact>;
}

export interface RepairPatchValidationInput {
  context: RepairContext;
  patch: GenerationArtifact;
}

/**
 * Provider adapters can parse this contract before the orchestration layer is
 * invoked. Scope is deliberately checked separately because it is defined by
 * the particular failed generation.
 */
export const RepairArtifactPatchSchema = GenerationArtifactSchema.superRefine((patch, context) => {
  const seenPaths = new Set<string>();

  for (const file of patch.files) {
    if (!SAFE_GENERATED_FILE_PATH.test(file.path) || file.path.includes("..") || file.path.includes("\\")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Repair patch contains an unsafe file path: ${file.path}`,
      });
      continue;
    }
    if (seenPaths.has(file.path)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Repair patch contains a duplicate file path: ${file.path}`,
      });
    }
    seenPaths.add(file.path);
  }

  for (const packageName of patch.packages) {
    if (!PACKAGE_NAME.test(packageName)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Repair patch contains an invalid npm registry package: ${packageName}`,
      });
    }
  }
});

/**
 * Validates the model's structured patch before an injected sandbox applier is
 * allowed to see it. File edits are restricted to the repair context and npm
 * additions accept registry package names only.
 */
export function validateStructuredRepairPatch(input: RepairPatchValidationInput): GenerationArtifact {
  const patch = RepairArtifactPatchSchema.parse(input.patch);
  const allowedPaths = new Set(input.context.files.map((file) => file.path));

  if (patch.files.length === 0) {
    throw new Error("Repair patch contains no files.");
  }

  for (const file of patch.files) {
    if (!allowedPaths.has(file.path)) {
      throw new Error(`Repair patch modifies a file outside the repair scope: ${file.path}`);
    }
  }

  return patch;
}

/** Applies a validated partial patch in memory for the revalidation pipeline. */
export function mergeRepairPatch(
  artifact: GenerationArtifact,
  patch: GenerationArtifact,
): GenerationArtifact {
  const patchByPath = new Map(patch.files.map((file) => [file.path, file]));
  const files = artifact.files.map((file) => patchByPath.get(file.path) ?? file);

  return {
    files,
    packages: [...new Set([...(artifact.packages ?? []), ...(patch.packages ?? [])])],
  };
}
