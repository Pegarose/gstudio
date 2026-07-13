import type { GenerationMode } from "../contracts/identity";
import {
  CheckResultSchema,
  GenerationArtifactSchema,
  ProductBriefSchema,
  DesignPlanSchema,
  ValidationReportSchema,
  type CheckResult,
  type DesignPlan,
  type GenerationArtifact,
  type ProductBrief,
  type RepairEligibility,
  type RuleViolation,
  type ResponsiveCheckResult,
  type SkippedValidationStep,
  type ValidationFailureClass,
  type ValidationReport,
  type VisualEvaluation,
} from "../contracts/validation";
import type { SandboxBuildResult } from "./build-validator";
import type { BrowserValidationReport } from "./browser-validator";
import type { DependencyValidationResult } from "./dependency-validator";
import type { CapturedVisualEvidenceBundle } from "./visual-evaluator";

const REPAIRABLE_FAILURE_CLASSES = new Set<ValidationFailureClass>([
  "static-rule",
  "dependency",
  "compile",
  "runtime",
  "responsive",
  "accessibility",
  "visual-fidelity",
]);

const CLONE_VISUAL_AXES = [
  "structure",
  "typography",
  "color",
  "spacing",
  "responsive",
  "screenshot",
] as const;

const MINIMUM_CLONE_VISUAL_SCORE = 0.8;
const REQUIRED_MOBILE_VIEWPORT_WIDTHS = [320, 375, 414, 768] as const;

/**
 * Reference evidence retained after source capture. The image bytes themselves
 * remain in the artifact store; the validator receives only durable keys plus
 * their paired desktop/mobile layout evidence.
 */
export interface DurableCloneReferenceEvidence extends CapturedVisualEvidenceBundle {
  kind: "clone-reference-v1";
  captureId: string;
  sourceUrl: string;
  capturedAt: string;
}

/**
 * A persisted brand extraction, not an evaluator result constructed at call
 * time. `artifactKey` identifies the stored extraction used to derive it.
 */
export interface DurableBrandLanguageBundle {
  kind: "brand-language-v1";
  artifactKey: string;
  sourceUrl: string;
  capturedAt: string;
  evaluation: CheckResult;
}

export interface ReferenceBundle {
  source?: DurableCloneReferenceEvidence;
  brandLanguage?: DurableBrandLanguageBundle;
}

export interface ValidationCapture {
  /** Captured output screenshot/layout evidence consumed by the visual adapter. */
  output: unknown;
}

export interface ValidationRunInput {
  artifact: GenerationArtifact;
  brief: ProductBrief;
  plan: DesignPlan;
  mode: GenerationMode;
  sandboxId: string;
  sandboxUrl: string;
  desktopWidth: number;
  reference?: ReferenceBundle;
}

export interface CloneVisualValidation {
  mode: "clone";
  visual: VisualEvaluation;
}

export interface InspirationVisualValidation {
  mode: "inspiration";
  brandLanguage: CheckResult;
}

export interface ScratchVisualValidation {
  mode: "scratch" | "edit";
  originality: CheckResult;
  honesty: CheckResult;
}

export type ModeVisualValidation =
  | CloneVisualValidation
  | InspirationVisualValidation
  | ScratchVisualValidation;

export interface ValidationRunnerDependencies {
  validateStatic(input: Pick<ValidationRunInput, "artifact" | "brief" | "plan">): RuleViolation[] | Promise<RuleViolation[]>;
  validateDependencies(input: Pick<ValidationRunInput, "artifact" | "plan">): DependencyValidationResult | Promise<DependencyValidationResult>;
  validateBuild(input: Pick<ValidationRunInput, "artifact" | "sandboxId">): Promise<SandboxBuildResult>;
  validateBrowser(input: Pick<ValidationRunInput, "sandboxId" | "sandboxUrl" | "desktopWidth">): Promise<BrowserValidationReport>;
  captureOutput(input: Pick<ValidationRunInput, "artifact" | "mode" | "sandboxId" | "sandboxUrl" | "reference">): Promise<ValidationCapture>;
  evaluateVisual(input: ValidationRunInput & { capture: ValidationCapture }): Promise<ModeVisualValidation>;
}

export class ValidationStepError extends Error {
  constructor(
    readonly failureClass: ValidationFailureClass,
    message: string,
  ) {
    super(message);
    this.name = "ValidationStepError";
  }
}

export function createValidationRunner(dependencies: ValidationRunnerDependencies) {
  return {
    run: (input: ValidationRunInput) => runValidation(input, dependencies),
  };
}

/**
 * Runs deterministic generation validation in the documented order. This
 * module owns no sandbox, browser, provider, or persistence implementation;
 * callers supply each boundary through `ValidationRunnerDependencies`.
 */
export async function runValidation(
  rawInput: ValidationRunInput,
  dependencies: ValidationRunnerDependencies,
): Promise<ValidationReport> {
  const input = parseInput(rawInput);
  const report: ValidationReport = {
    static: [],
    responsive: [],
  };
  const failures: ValidationStepError[] = [];
  const skipped: SkippedValidationStep[] = [];

  try {
    report.static = await dependencies.validateStatic({
      artifact: input.artifact,
      brief: input.brief,
      plan: input.plan,
    });
    if (report.static.some((violation) => violation.severity === "error")) {
      addFailure(failures, "static-rule", "Static validation reported error violations.");
    }
  } catch (error) {
    addFailure(failures, errorForStep(error, "static-rule"));
  }

  try {
    const dependencyResult = await dependencies.validateDependencies({
      artifact: input.artifact,
      plan: input.plan,
    });
    report.dependency = dependencyCheck(dependencyResult);
  } catch (error) {
    const failure = errorForStep(error, "dependency");
    report.dependency = failedCheck(failure.message);
    addFailure(failures, failure);
  }

  if (report.dependency?.passed === false) {
    skipAfterDependencyFailure(skipped, report.dependency.evidence);
    return finishReport(report, failures, skipped);
  }

  try {
    const buildResult = await dependencies.validateBuild({
      artifact: input.artifact,
      sandboxId: input.sandboxId,
    });
    report.build = checkFromBuild(buildResult);
    report.compile = report.build;
    if (!buildResult.passed) {
      addFailure(failures, "compile", buildResult.evidence);
    }
  } catch (error) {
    const failure = errorForStep(error, "sandbox-infrastructure");
    report.build = failedCheck(failure.message);
    report.compile = report.build;
    addFailure(failures, failure);
  }

  if (report.build?.passed === false) {
    skipAfterBuildFailure(skipped, report.build.evidence);
    return finishReport(report, failures, skipped);
  }

  try {
    const browser = await dependencies.validateBrowser({
      sandboxId: input.sandboxId,
      sandboxUrl: input.sandboxUrl,
      desktopWidth: input.desktopWidth,
    });
    report.runtime = browser.runtime;
    const responsive = validateRequiredResponsiveProbes(browser.responsive, input.desktopWidth);
    report.responsive = responsive;
    report.keyboard = browser.keyboard;
    report.reducedMotion = browser.reducedMotion;
    report.accessibility = browser.accessibility;
    collectBrowserFailures({ ...browser, responsive }, failures);
  } catch (error) {
    const failure = errorForStep(error, "sandbox-infrastructure");
    report.runtime = failedCheck(failure.message);
    report.keyboard = failedCheck(failure.message);
    report.reducedMotion = failedCheck(failure.message);
    report.accessibility = failedCheck(failure.message);
    addFailure(failures, failure);
  }

  let capture: ValidationCapture | undefined;
  try {
    capture = await dependencies.captureOutput({
      artifact: input.artifact,
      mode: input.mode,
      sandboxId: input.sandboxId,
      sandboxUrl: input.sandboxUrl,
      reference: input.reference,
    });
    report.capture = passedCheck("Output screenshot capture completed.");
  } catch (error) {
    const failure = errorForStep(error, "sandbox-infrastructure");
    report.capture = failedCheck(failure.message);
    addFailure(failures, failure);
    skipped.push({ step: "visual", reason: `Skipped because output capture failed: ${failure.message}` });
  }

  if (capture) {
    await runModeVisualValidation(input, capture, dependencies, report, failures);
  } else if (report.capture?.passed) {
    const failure = new ValidationStepError("sandbox-infrastructure", "Capture returned no output evidence.");
    report.capture = failedCheck(failure.message);
    addFailure(failures, failure);
    skipped.push({ step: "visual", reason: `Skipped because output capture failed: ${failure.message}` });
  }

  return finishReport(report, failures, skipped);
}

function parseInput(input: ValidationRunInput): ValidationRunInput {
  return {
    ...input,
    artifact: GenerationArtifactSchema.parse(input.artifact),
    brief: ProductBriefSchema.parse(input.brief),
    plan: DesignPlanSchema.parse(input.plan),
  };
}

function dependencyCheck(result: DependencyValidationResult): CheckResult {
  return passedCheck(JSON.stringify({
    declaredPackages: result.declaredPackages,
    imports: result.imports,
    missingPackages: result.missingPackages,
  }));
}

function checkFromBuild(result: SandboxBuildResult): CheckResult {
  return result.passed ? passedCheck(result.evidence) : failedCheck(result.evidence);
}

function collectBrowserFailures(
  browser: BrowserValidationReport,
  failures: ValidationStepError[],
): void {
  if (!browser.runtime.passed) addFailure(failures, "runtime", browser.runtime.evidence);
  if (!browser.responsive.every((item) => item.passed)) {
    addFailure(failures, "responsive", browser.responsive.filter((item) => !item.passed).map((item) => item.evidence).join("\n"));
  }
  if (!browser.keyboard.passed) addFailure(failures, "accessibility", browser.keyboard.evidence);
  if (!browser.reducedMotion.passed) addFailure(failures, "accessibility", browser.reducedMotion.evidence);
  if (!browser.accessibility.passed) addFailure(failures, "accessibility", browser.accessibility.evidence);
}

function validateRequiredResponsiveProbes(
  probes: ResponsiveCheckResult[],
  desktopWidth: number,
): ResponsiveCheckResult[] {
  const requiredWidths = [...REQUIRED_MOBILE_VIEWPORT_WIDTHS, desktopWidth];
  const requiredWidthSet = new Set(requiredWidths);
  const counts = new Map<number, number>();
  const violations: ResponsiveCheckResult[] = [];

  for (const probe of probes) {
    counts.set(probe.width, (counts.get(probe.width) ?? 0) + 1);
    if (!requiredWidthSet.has(probe.width)) {
      violations.push(responsiveViolation(
        probe.width,
        `Unexpected responsive probe: ${probe.width}px.`,
      ));
    }
  }

  for (const width of requiredWidths) {
    const count = counts.get(width) ?? 0;
    if (count === 0) {
      violations.push(responsiveViolation(width, `Missing required responsive probe: ${width}px.`));
    } else if (count > 1) {
      violations.push(responsiveViolation(width, `Duplicate responsive probe: ${width}px (${count} probes).`));
    }
  }

  return [...probes, ...violations];
}

function responsiveViolation(width: number, evidence: string): ResponsiveCheckResult {
  return {
    width,
    horizontalOverflow: false,
    passed: false,
    evidence,
  };
}

async function runModeVisualValidation(
  input: ValidationRunInput,
  capture: ValidationCapture,
  dependencies: ValidationRunnerDependencies,
  report: ValidationReport,
  failures: ValidationStepError[],
): Promise<void> {
  try {
    const visualResult = await dependencies.evaluateVisual({ ...input, capture });
    if (visualResult.mode !== input.mode) {
      throw new ValidationStepError("sandbox-infrastructure", "Visual evaluator returned a result for a different generation mode.");
    }

    if (visualResult.mode === "clone") {
      report.visual = visualResult.visual;
      const failingAxes = CLONE_VISUAL_AXES.filter((axis) => (visualResult.visual[axis] ?? 0) < MINIMUM_CLONE_VISUAL_SCORE);
      if (failingAxes.length > 0) {
        addFailure(failures, "visual-fidelity", `Clone visual hard gates failed: ${failingAxes.join(", ")}.`);
      }
      return;
    }

    if (visualResult.mode === "inspiration") {
      report.brandLanguage = CheckResultSchema.parse(visualResult.brandLanguage);
      if (!report.brandLanguage.passed) {
        addFailure(failures, "visual-fidelity", report.brandLanguage.evidence);
      }
      return;
    }

    report.originality = CheckResultSchema.parse(visualResult.originality);
    report.honesty = CheckResultSchema.parse(visualResult.honesty);
    if (!report.originality.passed) addFailure(failures, "visual-fidelity", report.originality.evidence);
    if (!report.honesty.passed) addFailure(failures, "visual-fidelity", report.honesty.evidence);
  } catch (error) {
    addFailure(failures, errorForStep(error, "visual-fidelity"));
  }
}

function skipAfterDependencyFailure(skipped: SkippedValidationStep[], evidence: string): void {
  skipped.push(
    { step: "build", reason: `Skipped because dependency validation failed: ${evidence}` },
    { step: "browser", reason: "Skipped because dependency validation failed." },
    { step: "capture", reason: "Skipped because dependency validation failed." },
    { step: "visual", reason: "Skipped because dependency validation failed." },
  );
}

function skipAfterBuildFailure(skipped: SkippedValidationStep[], evidence: string): void {
  skipped.push(
    { step: "browser", reason: `Skipped because build validation failed: ${evidence}` },
    { step: "capture", reason: "Skipped because build validation failed." },
    { step: "visual", reason: "Skipped because build validation failed." },
  );
}

function finishReport(
  report: ValidationReport,
  failures: ValidationStepError[],
  skipped: SkippedValidationStep[],
): ValidationReport {
  const terminalFailure = failures.find((failure) => !REPAIRABLE_FAILURE_CLASSES.has(failure.failureClass)) ?? failures[0];
  const repairEligibility: RepairEligibility = terminalFailure
    ? {
      eligible: REPAIRABLE_FAILURE_CLASSES.has(terminalFailure.failureClass),
      reason: terminalFailure.message,
      failureClass: terminalFailure.failureClass,
    }
    : {
      eligible: false,
      reason: "All required validation hard gates passed.",
    };

  return ValidationReportSchema.parse({
    ...report,
    ...(skipped.length > 0 ? { skipped } : {}),
    repairEligibility,
    finalStatus: failures.length === 0 ? "passed" : "failed",
  });
}

function addFailure(
  failures: ValidationStepError[],
  failureClass: ValidationFailureClass | ValidationStepError,
  message?: string,
): void {
  failures.push(
    failureClass instanceof ValidationStepError
      ? failureClass
      : new ValidationStepError(failureClass, message ?? failureClass),
  );
}

function errorForStep(error: unknown, fallbackFailureClass: ValidationFailureClass): ValidationStepError {
  if (error instanceof ValidationStepError) return error;
  return new ValidationStepError(fallbackFailureClass, error instanceof Error ? error.message : String(error));
}

function passedCheck(evidence: string): CheckResult {
  return { passed: true, evidence };
}

function failedCheck(evidence: string): CheckResult {
  return { passed: false, evidence };
}
