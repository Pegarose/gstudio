import type { GenerationStatus } from "../contracts/state";
import type {
  GenerationArtifact,
  ValidationReport,
} from "../contracts/validation";
import {
  buildRepairContext,
  type DirectRepairDependencyResolver,
  type RepairContext,
} from "../repair/repair-context";
import {
  mergeRepairPatch,
  validateStructuredRepairPatch,
  type RepairPatchGenerator,
} from "../repair/repair-generator";
import { isRepairEligibleReport } from "../repair/repair-policy";
import {
  createValidationRunner,
  type ValidationRunInput,
  type ValidationRunnerDependencies,
} from "../validation/validation-runner";

export interface GenerationValidationPersistence {
  persistValidation(input: {
    generationId: string;
    report: ValidationReport;
    status: GenerationStatus;
  }): Promise<void>;
}

export interface GenerationRepairClaim {
  id: string;
  repairCount: number;
}

export interface GenerationRepairPersistence extends GenerationValidationPersistence {
  /** Atomically increments repair_count only when it is still below one. */
  claimRepairAttempt(generationId: string): Promise<GenerationRepairClaim | null>;
}

export interface RepairPatchApplier {
  applyPatch(input: {
    generationId: string;
    sandboxId: string;
    patch: GenerationArtifact;
  }): Promise<void>;
}

export interface RepairCycleDependencies extends RepairPatchGenerator, RepairPatchApplier {
  resolveDirectDependencies?: DirectRepairDependencyResolver;
  /** An optional caller-owned semantic patch check after structural validation. */
  validatePatch?(input: {
    context: RepairContext;
    patch: GenerationArtifact;
  }): GenerationArtifact | Promise<GenerationArtifact>;
}

export interface GenerationOrchestratorDependencies {
  validation: ValidationRunnerDependencies;
  repository: GenerationValidationPersistence;
  /** Omitted until a composition root explicitly opts into the new repair flow. */
  repair?: RepairCycleDependencies;
}

export interface ValidateAndPersistInput extends ValidationRunInput {
  generationId: string;
}

export interface RepairAndRevalidateInput extends ValidationRunInput {
  generation: {
    id: string;
    repairCount: number;
  };
  initialReport: ValidationReport;
  /** Compiler/runtime adapters can provide known affected paths in addition to static violations. */
  implicatedFilePaths?: readonly string[];
}

export class RepairLimitError extends Error {
  constructor(generationId: string) {
    super(`Automatic repair limit reached for generation ${generationId}.`);
    this.name = "RepairLimitError";
  }
}

export class RepairClaimError extends Error {
  constructor(generationId: string) {
    super(`Automatic repair attempt was already claimed for generation ${generationId}.`);
    this.name = "RepairClaimError";
  }
}

/**
 * Narrow dependency-injected integration boundary for post-apply validation.
 * `validateAndPersist` remains the Task 5 behavior; the repair path is an
 * explicit opt-in method and does not activate the legacy stream route.
 */
export function createGenerationOrchestrator({
  validation,
  repository,
  repair,
}: GenerationOrchestratorDependencies) {
  const runner = createValidationRunner(validation);

  return {
    async validateAndPersist({ generationId, ...input }: ValidateAndPersistInput): Promise<ValidationReport> {
      const report = await runner.run(input);
      await repository.persistValidation({
        generationId,
        report,
        status: report.finalStatus ?? "failed",
      });
      return report;
    },

    async repairAndRevalidate(input: RepairAndRevalidateInput): Promise<ValidationReport> {
      if (!isRepairEligibleReport(input.initialReport)) {
        await repository.persistValidation({
          generationId: input.generation.id,
          report: input.initialReport,
          status: input.initialReport.finalStatus ?? "failed",
        });
        return input.initialReport;
      }

      if (input.generation.repairCount >= 1) {
        throw new RepairLimitError(input.generation.id);
      }

      if (!repair || !isGenerationRepairPersistence(repository)) {
        throw new Error("Repair cycle is not configured with repair dependencies and atomic persistence.");
      }

      const claim = await repository.claimRepairAttempt(input.generation.id);
      if (!claim) {
        throw new RepairClaimError(input.generation.id);
      }

      const context = buildRepairContext({
        report: input.initialReport,
        artifact: input.artifact,
        plan: input.plan,
        implicatedFilePaths: input.implicatedFilePaths,
        resolveDirectDependencies: repair.resolveDirectDependencies,
      });
      const generatedPatch = await repair.generatePatch(context);
      const structurallyValidPatch = validateStructuredRepairPatch({
        context,
        patch: generatedPatch,
      });
      const patch = repair.validatePatch
        ? await repair.validatePatch({ context, patch: structurallyValidPatch })
        : structurallyValidPatch;
      const validatedPatch = validateStructuredRepairPatch({ context, patch });

      await repair.applyPatch({
        generationId: input.generation.id,
        sandboxId: input.sandboxId,
        patch: validatedPatch,
      });

      const finalReport = await runner.run({
        ...input,
        artifact: mergeRepairPatch(input.artifact, validatedPatch),
      });
      await repository.persistValidation({
        generationId: input.generation.id,
        report: finalReport,
        status: finalReport.finalStatus ?? "failed",
      });
      return finalReport;
    },
  };
}

function isGenerationRepairPersistence(
  repository: GenerationValidationPersistence,
): repository is GenerationRepairPersistence {
  return "claimRepairAttempt" in repository && typeof repository.claimRepairAttempt === "function";
}
