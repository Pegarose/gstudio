import {
  DesignPlanSchema,
  GenerationArtifactSchema,
  ValidationReportSchema,
  type DesignPlan,
  type GenerationArtifact,
  type ValidationFile,
  type ValidationReport,
} from "../contracts/validation";

export interface DirectRepairDependencyResolverInput {
  artifact: GenerationArtifact;
  report: ValidationReport;
  implicatedFiles: readonly ValidationFile[];
}

/**
 * A deterministic caller-owned resolver for direct stylesheet or component
 * dependencies. It receives only the violated files and must return paths from
 * the supplied artifact; unrelated generated files are ignored by this layer.
 */
export type DirectRepairDependencyResolver = (
  input: DirectRepairDependencyResolverInput,
) => readonly ValidationFile[];

export interface RepairContextInput {
  report: ValidationReport;
  artifact: GenerationArtifact;
  plan: DesignPlan;
  /** Optional compiler/runtime file evidence supplied by the integration edge. */
  implicatedFilePaths?: readonly string[];
  resolveDirectDependencies?: DirectRepairDependencyResolver;
}

export interface RepairFailedCheck {
  name: string;
  file: string | null;
  evidence: string;
}

export interface RepairContext {
  plan: DesignPlan;
  report: ValidationReport;
  files: ValidationFile[];
  failedChecks: RepairFailedCheck[];
  prompt: string;
}

/**
 * Creates the complete, bounded input for the repair generator. A generated
 * repair is never given the full project unless every file is directly
 * implicated or declared as a direct dependency by the injected resolver.
 */
export function buildRepairContext(rawInput: RepairContextInput): RepairContext {
  const artifact = GenerationArtifactSchema.parse(rawInput.artifact);
  const plan = DesignPlanSchema.parse(rawInput.plan);
  const report = ValidationReportSchema.parse(rawInput.report);
  const artifactByPath = new Map(artifact.files.map((file) => [file.path, file]));
  const implicatedPathSet = new Set([
    ...report.static
      .filter((violation) => violation.severity === "error")
      .map((violation) => violation.file),
    ...(rawInput.implicatedFilePaths ?? []),
  ]);
  const implicatedFiles = artifact.files.filter((file) => implicatedPathSet.has(file.path));
  const directDependencies = implicatedFiles.length > 0
    ? rawInput.resolveDirectDependencies?.({ artifact, report, implicatedFiles }) ?? []
    : [];
  const selectedPaths = new Set([
    ...implicatedFiles.map((file) => file.path),
    ...directDependencies
      .map((file) => file.path)
      .filter((path) => artifactByPath.has(path)),
  ]);
  const files = artifact.files.filter((file) => selectedPaths.has(file.path));
  const failedChecks = collectFailedChecks(report);

  return {
    plan,
    report,
    files,
    failedChecks,
    prompt: buildRepairPrompt({ plan, files, failedChecks }),
  };
}

function collectFailedChecks(report: ValidationReport): RepairFailedCheck[] {
  const staticChecks = report.static
    .filter((violation) => violation.severity === "error")
    .map((violation) => ({
      name: violation.code,
      file: violation.file,
      evidence: violation.evidence,
    }));
  const reportChecks: Array<[string, { passed: boolean; evidence: string } | undefined]> = [
    ["dependency", report.dependency],
    ["build", report.build],
    ["compile", report.compile],
    ["runtime", report.runtime],
    ["keyboard", report.keyboard],
    ["reduced-motion", report.reducedMotion],
    ["accessibility", report.accessibility],
    ["capture", report.capture],
    ["brand-language", report.brandLanguage],
    ["originality", report.originality],
    ["honesty", report.honesty],
  ];
  const nonStaticChecks = reportChecks
    .filter(([, check]) => check?.passed === false)
    .map(([name, check]) => ({ name, file: null, evidence: check!.evidence }));
  const responsiveChecks = report.responsive
    .filter((check) => !check.passed)
    .map((check) => ({ name: `responsive-${check.width}`, file: null, evidence: check.evidence }));

  return [...staticChecks, ...nonStaticChecks, ...responsiveChecks];
}

function buildRepairPrompt(input: {
  plan: DesignPlan;
  files: readonly ValidationFile[];
  failedChecks: readonly RepairFailedCheck[];
}): string {
  const failedChecks = input.failedChecks.length > 0
    ? input.failedChecks
      .map((check) => `- ${check.file ?? "project"} | ${check.name}: ${check.evidence}`)
      .join("\n")
    : "- No structured failure evidence was supplied.";
  const files = input.files.length > 0
    ? input.files.map((file) => `- ${file.path}`).join("\n")
    : "- No generated file was implicated; return an empty patch rather than guessing.";

  return [
    "Repair this generated application with a structured artifact patch.",
    "",
    "ORIGINAL VALIDATED DESIGN PLAN:",
    JSON.stringify(input.plan),
    "",
    "EXACT FAILED CHECKS AND EVIDENCE:",
    failedChecks,
    "",
    "IMPLICATED FILES AND DIRECT DEPENDENCIES (the only files you may modify):",
    files,
    "",
    "Do not delete planned functionality. Preserve the design plan, fix only the documented failures, and return only a structured patch for the listed files and safe npm packages.",
  ].join("\n");
}
