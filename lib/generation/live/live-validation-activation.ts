import {
  ValidationReportSchema,
  type ValidationReport,
} from "../contracts/validation";
import type {
  PersistFinalInput,
  RepairAndRevalidateInput,
} from "../orchestration/generation-orchestrator";
import { isRepairEligibleReport } from "../repair/repair-policy";
import type { SandboxService } from "../../sandbox/service/contracts";
import type { ValidationRunInput } from "../validation/validation-runner";

export interface LiveActivationInput extends ValidationRunInput {
  generation: {
    id: string;
    projectId: string;
    repairCount: number;
  };
  applyCandidate(): Promise<void>;
  snapshotPaths: string[];
}

export interface LiveActivationResult {
  status: "passed" | "failed";
  report: ValidationReport;
  rolledBack: boolean;
}

/**
 * Persistence is intentionally terminal: callers must never fall back to a
 * generic success/error event after sandbox rollback has already completed.
 * The typed result lets the SSE boundary still describe that safe terminal
 * state without attempting a second persistence write.
 */
export class LiveActivationPersistenceError extends Error {
  readonly result: LiveActivationResult;

  constructor(cause: unknown, result: LiveActivationResult) {
    super(`Live validation terminal persistence failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "LiveActivationPersistenceError";
    this.result = result;
  }
}

export interface LiveValidationOrchestrator {
  validate(input: ValidationRunInput): Promise<ValidationReport>;
  repairAndRevalidate(input: RepairAndRevalidateInput): Promise<ValidationReport>;
  persistFinal(input: PersistFinalInput): Promise<void>;
}

export interface LiveValidationActivationDependencies {
  sandbox: Pick<SandboxService, "snapshotFiles" | "restoreFiles">;
  orchestrator: LiveValidationOrchestrator;
}

/**
 * Applies one generated candidate inside a rollback boundary. It persists one
 * terminal report after every validation/repair outcome so callers never need
 * to infer quality from a candidate stream completion event.
 */
export function createLiveValidationActivation({
  sandbox,
  orchestrator,
}: LiveValidationActivationDependencies) {
  return {
    async activate(input: LiveActivationInput): Promise<LiveActivationResult> {
      const snapshots = await sandbox.snapshotFiles(input.sandboxId, input.snapshotPaths);
      let report: ValidationReport | undefined;
      let rollback: Awaited<ReturnType<typeof restoreOnce>> | undefined;
      let terminalPersistenceStarted = false;

      try {
        await input.applyCandidate();
        report = await orchestrator.validate(validationInput(input));

        if (report.finalStatus === "failed" && isRepairEligibleReport(report)) {
          report = await orchestrator.repairAndRevalidate({
            ...validationInput(input),
            generation: input.generation,
            initialReport: report,
          });
        }

        if (report.finalStatus === "passed") {
          terminalPersistenceStarted = true;
          await orchestrator.persistFinal({
            generationId: input.generation.id,
            report,
            status: "passed",
          });
          return { status: "passed", report, rolledBack: false };
        }

        rollback = await restoreOnce(sandbox, input.sandboxId, snapshots);
        report = terminalizeFailedReport(report, rollback.evidence);
        terminalPersistenceStarted = true;
        await orchestrator.persistFinal({
          generationId: input.generation.id,
          report,
          status: "failed",
        });
        return { status: "failed", report, rolledBack: rollback.completed };
      } catch (error) {
        rollback ??= await restoreOnce(sandbox, input.sandboxId, snapshots);

        if (terminalPersistenceStarted) {
          const persistenceEvidence = ` ${rollback.evidence} Terminal validation persistence failed: ${error instanceof Error ? error.message : String(error)}`;
          const failedReport = terminalizeFailedReport(
            report?.finalStatus === "failed" ? report : terminalActivationFailureReport(error),
            persistenceEvidence,
          );
          throw new LiveActivationPersistenceError(error, {
            status: "failed",
            report: failedReport,
            rolledBack: rollback.completed,
          });
        }

        report = terminalActivationFailureReport(error);
        report = terminalizeFailedReport(report, rollback.evidence);
        terminalPersistenceStarted = true;
        await orchestrator.persistFinal({
          generationId: input.generation.id,
          report,
          status: "failed",
        });
        return { status: "failed", report, rolledBack: rollback.completed };
      }
    },
  };
}

function validationInput(input: LiveActivationInput): ValidationRunInput {
  const {
    generation: _generation,
    applyCandidate: _applyCandidate,
    snapshotPaths: _snapshotPaths,
    ...validation
  } = input;
  return validation;
}

async function restoreOnce(
  sandbox: Pick<SandboxService, "restoreFiles">,
  sandboxId: string,
  snapshots: Awaited<ReturnType<Pick<SandboxService, "snapshotFiles">["snapshotFiles"]>>,
): Promise<{ completed: boolean; evidence: string }> {
  try {
    await sandbox.restoreFiles(sandboxId, snapshots);
    return { completed: true, evidence: "Rollback completed." };
  } catch (error) {
    return {
      completed: false,
      evidence: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function terminalizeFailedReport(report: ValidationReport, rollbackEvidence: string): ValidationReport {
  return ValidationReportSchema.parse({
    ...report,
    repairEligibility: {
      eligible: false,
      ...(report.repairEligibility?.failureClass
        ? { failureClass: report.repairEligibility.failureClass }
        : { failureClass: "sandbox-infrastructure" }),
      reason: `${report.repairEligibility?.reason ?? "Live validation failed."} ${rollbackEvidence}`,
    },
    finalStatus: "failed",
  });
}

function terminalActivationFailureReport(error: unknown): ValidationReport {
  const evidence = error instanceof Error ? error.message : String(error);
  return ValidationReportSchema.parse({
    static: [],
    responsive: [],
    repairEligibility: {
      eligible: false,
      failureClass: "sandbox-infrastructure",
      reason: `Live activation failed: ${evidence}`,
    },
    finalStatus: "failed",
  });
}
