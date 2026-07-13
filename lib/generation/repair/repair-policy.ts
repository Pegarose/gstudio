import type {
  RepairEligibility,
  ValidationFailureClass,
  ValidationReport,
} from "../contracts/validation";

export const REPAIRABLE_FAILURE_CLASSES = [
  "static-rule",
  "dependency",
  "compile",
  "runtime",
  "responsive",
  "accessibility",
  "visual-fidelity",
] as const satisfies readonly ValidationFailureClass[];

export const INELIGIBLE_REPAIR_FAILURE_CLASSES = [
  "capture-policy",
  "provider-unavailable",
  "secret-missing",
  "sandbox-infrastructure",
  "user-input",
] as const satisfies readonly ValidationFailureClass[];

const REPAIRABLE_FAILURE_CLASS_SET = new Set<ValidationFailureClass>(REPAIRABLE_FAILURE_CLASSES);

/** Returns true only for the documented single-repair code/design failures. */
export function isRepairEligibleFailure(failureClass: ValidationFailureClass | undefined): boolean {
  return failureClass !== undefined && REPAIRABLE_FAILURE_CLASS_SET.has(failureClass);
}

/**
 * The validation runner provides the canonical eligibility classification. This
 * defensive check prevents callers from sending an ineligible terminal report
 * into a repair model even when a malformed report claims otherwise.
 */
export function isRepairEligibleReport(report: ValidationReport): boolean {
  const eligibility: RepairEligibility | undefined = report.repairEligibility;
  return eligibility?.eligible === true && isRepairEligibleFailure(eligibility.failureClass);
}
