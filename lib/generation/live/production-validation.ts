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
  adaptCapturedVisualEvidence,
  evaluateVisualFidelity,
  type CapturedImageReader,
  type CapturedVisualEvidenceBundle,
} from "../validation/visual-evaluator";
import type {
  DurableBrandLanguageBundle,
  DurableCloneReferenceEvidence,
} from "../validation/validation-runner";

export interface ProductionValidationDependencies {
  sandbox: Pick<SandboxService, "runCommand">;
  captureOutput: ValidationRunnerDependencies["captureOutput"];
  readPng: CapturedImageReader["readPng"];
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
        const brandLanguage = asDurableBrandLanguageBundle(input.reference?.brandLanguage);
        if (!brandLanguage) throw referenceEvidenceUnavailable();
        return { mode: "inspiration", brandLanguage: brandLanguage.evaluation };
      }

      const source = asDurableCloneReferenceEvidence(input.reference?.source);
      const output = asCapturedVisualEvidenceBundle(input.capture.output);
      if (!source || !output) throw referenceEvidenceUnavailable();

      const sourceEvidence = await adaptSourceReferenceEvidence(source, dependencies.readPng);
      const outputEvidence = await adaptOutputEvidence(output, dependencies.readPng);

      return {
        mode: "clone",
        visual: evaluateVisualFidelity({ source: sourceEvidence, output: outputEvidence }),
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

/**
 * Source artifacts are mandatory durable clone evidence. A malformed key or a
 * rejected artifact-store read means clone fidelity cannot be evaluated, not
 * that the generated candidate has a repairable visual defect.
 */
async function adaptSourceReferenceEvidence(
  source: CapturedVisualEvidenceBundle,
  readPng: CapturedImageReader["readPng"],
) {
  try {
    return await adaptCapturedVisualEvidence(source, { readPng });
  } catch {
    throw referenceEvidenceUnavailable();
  }
}

/** Output evidence is sandbox-owned; a read failure is infrastructure, never a repairable fidelity score. */
async function adaptOutputEvidence(
  output: CapturedVisualEvidenceBundle,
  readPng: CapturedImageReader["readPng"],
) {
  try {
    return await adaptCapturedVisualEvidence(output, { readPng });
  } catch (error) {
    const evidence = error instanceof Error ? error.message : String(error);
    throw new ValidationStepError(
      "sandbox-infrastructure",
      `Output evidence unavailable for live fidelity validation: ${evidence}`,
    );
  }
}

function asDurableCloneReferenceEvidence(value: unknown): DurableCloneReferenceEvidence | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "clone-reference-v1") return null;
  if (!isNonEmptyString(value.captureId) || !isHttpUrl(value.sourceUrl) || !isIsoTimestamp(value.capturedAt)) return null;
  return asCapturedVisualEvidenceBundle(value) as DurableCloneReferenceEvidence | null;
}

function asDurableBrandLanguageBundle(value: unknown): DurableBrandLanguageBundle | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "brand-language-v1") return null;
  const artifactKey = value.artifactKey;
  const sourceUrl = value.sourceUrl;
  const capturedAt = value.capturedAt;
  if (!isNonEmptyString(artifactKey) || !isNonEmptyString(sourceUrl) || !isNonEmptyString(capturedAt)) return null;
  if (!isHttpUrl(sourceUrl) || !isIsoTimestamp(capturedAt)) return null;

  const evaluation = CheckResultSchema.safeParse(value.evaluation);
  if (!evaluation.success) return null;

  return {
    kind: "brand-language-v1",
    artifactKey,
    sourceUrl,
    capturedAt,
    evaluation: evaluation.data,
  };
}

function asCapturedVisualEvidenceBundle(value: unknown): CapturedVisualEvidenceBundle | null {
  if (!isRecord(value)) return null;
  if (!isCapturedImageReference(value.desktopScreenshot) || !isCapturedImageReference(value.mobileScreenshot)) return null;
  if (!isLayoutEvidence(value.desktopLayout) || !isLayoutEvidence(value.mobileLayout)) return null;
  return value as unknown as CapturedVisualEvidenceBundle;
}

function isCapturedImageReference(value: unknown): boolean {
  if (!isRecord(value) || "png" in value) return false;
  return value.mediaType === "image/png"
    && isNonEmptyString(value.artifactKey)
    && isPositiveFinite(value.width)
    && isPositiveFinite(value.height)
    && isPositiveFinite(value.devicePixelRatio);
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): boolean {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoTimestamp(value: unknown): boolean {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}
