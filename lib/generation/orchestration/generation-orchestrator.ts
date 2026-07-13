import type { GenerationStatus } from "../contracts/state";
import type { ValidationReport } from "../contracts/validation";
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

export interface GenerationOrchestratorDependencies {
  validation: ValidationRunnerDependencies;
  repository: GenerationValidationPersistence;
}

export interface ValidateAndPersistInput extends ValidationRunInput {
  generationId: string;
}

/**
 * Narrow integration boundary for the post-apply validation pipeline. Live
 * stream-route activation and the one-repair cycle are intentionally outside
 * this module and are owned by later integration work.
 */
export function createGenerationOrchestrator({
  validation,
  repository,
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
  };
}
