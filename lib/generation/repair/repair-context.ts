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
      .filter((path) => isAllowedDirectDependency(path, implicatedFiles, artifactByPath)),
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
  const visualChecks = report.repairEligibility?.failureClass === "visual-fidelity" && report.visual
    ? [{
      name: "visual-fidelity",
      file: null,
      evidence: JSON.stringify(report.visual),
    }]
    : [];
  const repairReason = report.repairEligibility?.failureClass === "visual-fidelity"
    ? [{
      name: "repair-eligibility",
      file: null,
      evidence: report.repairEligibility.reason,
    }]
    : [];

  return [...staticChecks, ...nonStaticChecks, ...responsiveChecks, ...visualChecks, ...repairReason];
}

function isAllowedDirectDependency(
  candidatePath: string,
  implicatedFiles: readonly ValidationFile[],
  artifactByPath: ReadonlyMap<string, ValidationFile>,
): boolean {
  const candidate = artifactByPath.get(candidatePath);
  if (!candidate) return false;

  const directlyReferenced = new Set(
    implicatedFiles.flatMap((file) => extractDirectRelativeReferences(file)),
  );
  if (!matchesReference(candidate.path, directlyReferenced)) return false;

  if (isCssFile(candidate.path)) return true;
  return isComponentFile(candidate.path)
    && implicatedFiles.some((file) => directoryOf(file.path) === directoryOf(candidate.path));
}

function extractDirectRelativeReferences(file: ValidationFile): string[] {
  const references: string[] = [];
  const pattern = /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|@import\s+(?:url\(\s*)?["']([^"']+)["']/g;

  for (let match = pattern.exec(file.content); match; match = pattern.exec(file.content)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier?.startsWith(".")) {
      references.push(resolveRelativePath(file.path, specifier));
    }
  }

  return references;
}

function resolveRelativePath(fromPath: string, specifier: string): string {
  const resolvedSegments = directoryOf(fromPath).split("/").filter(Boolean);
  for (const segment of specifier.split("/").filter(Boolean)) {
    if (segment === ".") continue;
    if (segment === "..") {
      resolvedSegments.pop();
      continue;
    }
    resolvedSegments.push(segment);
  }
  return resolvedSegments.join("/");
}

function matchesReference(candidatePath: string, references: ReadonlySet<string>): boolean {
  const withoutExtension = candidatePath.replace(/\.(?:[cm]?[jt]sx?|css)$/i, "");
  return references.has(candidatePath) || references.has(withoutExtension);
}

function isCssFile(path: string): boolean {
  return /^src\/.+\.css$/i.test(path);
}

function isComponentFile(path: string): boolean {
  return /^src\/.+\.(?:[cm]?tsx|[cm]?jsx)$/i.test(path);
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? "" : path.slice(0, separator);
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
