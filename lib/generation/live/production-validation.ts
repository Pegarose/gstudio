import type { SandboxService } from "../../sandbox/service/contracts";
import {
  CheckResultSchema,
  type CheckResult,
} from "../contracts/validation";
import {
  validateBrowser,
  type BrowserValidationReport,
} from "../validation/browser-validator";
import { validateSandboxBuild } from "../validation/build-validator";
import { validateDependencies } from "../validation/dependency-validator";
import { validateStaticRules } from "../validation/static-validator";
import {
  ValidationStepError,
  type ValidationRunnerDependencies,
} from "../validation/validation-runner";
import {
  evaluateVisualFidelity,
  type VisualEvidenceBundle,
} from "../validation/visual-evaluator";

export interface ProductionValidationDependencies {
  sandbox: Pick<SandboxService, "runCommand">;
  captureOutput: ValidationRunnerDependencies["captureOutput"];
  validateBrowser?: (input: {
    url: string;
    desktopWidth: number;
  }) => Promise<BrowserValidationReport>;
}

const REFERENCE_EVIDENCE_UNAVAILABLE = "Reference evidence unavailable for live fidelity validation.";

/**
 * Production composition for deterministic checks. It deliberately accepts
 * capture output at the edge: no source visual evidence is fabricated when a
 * request did not durably retain it.
 */
export function createProductionValidationDependencies(
  dependencies: ProductionValidationDependencies,
): ValidationRunnerDependencies {
  const browserValidator = dependencies.validateBrowser ?? validateBrowser;

  return {
    validateStatic: ({ artifact, brief, plan }) => validateStaticRules({
      files: artifact.files,
      packages: artifact.packages,
      brief,
      plan,
    }),
    validateDependencies: ({ artifact }) => validateDependencies({
      artifact,
      templateDependencies: [],
    }),
    validateBuild: ({ sandboxId }) => validateSandboxBuild(sandboxId, dependencies.sandbox),
    validateBrowser: ({ sandboxUrl, desktopWidth }) => browserValidator({
      url: sandboxUrl,
      desktopWidth,
    }),
    captureOutput: dependencies.captureOutput,
    evaluateVisual: async (input) => {
      if (input.mode === "scratch" || input.mode === "edit") {
        const staticViolations = validateStaticRules({
          files: input.artifact.files,
          packages: input.artifact.packages,
          brief: input.brief,
          plan: input.plan,
        });
        const staticPassed = !staticViolations.some((violation) => violation.severity === "error");
        return {
          mode: input.mode,
          originality: staticGate("Originality check", staticPassed),
          honesty: staticGate("Honesty check", staticPassed),
        };
      }

      if (input.mode === "inspiration") {
        const brandLanguage = CheckResultSchema.safeParse(input.reference?.brandLanguage);
        if (!brandLanguage.success) throw referenceEvidenceUnavailable();
        return { mode: "inspiration", brandLanguage: brandLanguage.data };
      }

      const source = asVisualEvidenceBundle(input.reference?.source);
      const output = asVisualEvidenceBundle(input.capture.output);
      if (!source || !output) throw referenceEvidenceUnavailable();

      return {
        mode: "clone",
        visual: evaluateVisualFidelity({ source, output }),
      };
    },
  };
}

function staticGate(name: string, passed: boolean): CheckResult {
  return {
    passed,
    evidence: passed
      ? `${name} passed because static validation reported no error violations.`
      : `${name} failed because static validation reported error violations.`,
  };
}

function referenceEvidenceUnavailable(): ValidationStepError {
  return new ValidationStepError("capture-policy", REFERENCE_EVIDENCE_UNAVAILABLE);
}

function asVisualEvidenceBundle(value: unknown): VisualEvidenceBundle | null {
  if (!isRecord(value)) return null;
  if (!isScreenshotEvidence(value.desktopScreenshot) || !isScreenshotEvidence(value.mobileScreenshot)) return null;
  if (!isLayoutEvidence(value.desktopLayout) || !isLayoutEvidence(value.mobileLayout)) return null;
  return value as unknown as VisualEvidenceBundle;
}

function isScreenshotEvidence(value: unknown): boolean {
  if (!isRecord(value) || !Buffer.isBuffer(value.png) || !isRecord(value.viewport)) return false;
  return isPositiveFinite(value.viewport.width)
    && isPositiveFinite(value.viewport.height)
    && isPositiveFinite(value.viewport.devicePixelRatio);
}

function isLayoutEvidence(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.viewport)) return false;
  return isPositiveFinite(value.viewport.width)
    && isPositiveFinite(value.viewport.height)
    && Array.isArray(value.landmarks)
    && Array.isArray(value.typography)
    && Array.isArray(value.colors)
    && Array.isArray(value.spacing)
    && Array.isArray(value.responsive);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveFinite(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
