import "./setup";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { query } from "../../lib/db";
import {
  buildRepairContext,
  type DirectRepairDependencyResolver,
} from "../../lib/generation/repair/repair-context";
import {
  mergeRepairPatch,
  validateStructuredRepairPatch,
} from "../../lib/generation/repair/repair-generator";
import {
  INELIGIBLE_REPAIR_FAILURE_CLASSES,
  REPAIRABLE_FAILURE_CLASSES,
  isRepairEligibleFailure,
} from "../../lib/generation/repair/repair-policy";
import {
  RepairLimitError,
  createGenerationOrchestrator,
} from "../../lib/generation/orchestration/generation-orchestrator";
import {
  claimGenerationRepairAttempt,
  createGeneration,
  getGeneration,
} from "../../lib/generation/repository";
import type {
  GenerationArtifact,
  ValidationFailureClass,
  ValidationReport,
} from "../../lib/generation/contracts/validation";
import type { ValidationRunnerDependencies } from "../../lib/generation/validation/validation-runner";

const artifact: GenerationArtifact = {
  files: [
    {
      path: "src/App.tsx",
      content: "import \"./index.css\";\nimport { Helper } from \"./Helper\";\nexport function App() { return <h1>Needs repair</h1>; }",
    },
    { path: "src/index.css", content: ":root { --color-accent: #0055aa; }" },
    { path: "src/Helper.tsx", content: "export function Helper() { return null; }" },
    { path: "src/components/Card.tsx", content: "export function Card() { return null; }" },
    { path: "src/unrelated.tsx", content: "export function Unrelated() { return null; }" },
  ],
  packages: [],
};

function failedReport(failureClass: ValidationFailureClass = "static-rule"): ValidationReport {
  return {
    static: [
      {
        code: "missing-focus-visible",
        severity: "error",
        file: "src/App.tsx",
        line: 1,
        message: "Primary action has no focus state.",
        evidence: "src/App.tsx: button uses no focus-visible class",
      },
    ],
    responsive: [],
    repairEligibility: {
      eligible: isRepairEligibleFailure(failureClass),
      reason: `Validation failed as ${failureClass}.`,
      failureClass,
    },
    finalStatus: "failed",
  };
}

function passingValidationDependencies(runLog: string[], finalStaticErrors = false): ValidationRunnerDependencies {
  return {
    validateStatic: () => {
      runLog.push("static");
      return finalStaticErrors ? failedReport().static : [];
    },
    validateDependencies: () => {
      runLog.push("dependency");
      return {
        artifactPackages: [],
        templatePackages: [],
        declaredPackages: [],
        imports: [],
        missingPackages: [],
      };
    },
    validateBuild: async () => {
      runLog.push("build");
      return {
        passed: true,
        evidence: "build passed",
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    },
    validateBrowser: async () => {
      runLog.push("browser");
      return {
        runtime: { passed: true, evidence: "runtime passed" },
        responsive: [320, 375, 414, 768, 1440].map((width) => ({
          width,
          horizontalOverflow: false,
          passed: true,
          evidence: `${width}px passed`,
        })),
        keyboard: { passed: true, evidence: "keyboard passed" },
        reducedMotion: { passed: true, evidence: "motion passed" },
        accessibility: { passed: true, evidence: "accessibility passed" },
        passed: true,
      };
    },
    captureOutput: async () => {
      runLog.push("capture");
      return { output: "captured" };
    },
    evaluateVisual: async () => {
      runLog.push("visual");
      return {
        mode: "scratch" as const,
        originality: { passed: true, evidence: "original" },
        honesty: { passed: true, evidence: "honest" },
      };
    },
  };
}

test("repair context contains only implicated files and deterministic direct dependencies", () => {
  const resolver: DirectRepairDependencyResolver = ({ implicatedFiles }) => {
    assert.deepEqual(implicatedFiles.map((file) => file.path), ["src/App.tsx"]);
    return [
      artifact.files[1]!,
      artifact.files[2]!,
      artifact.files[3]!,
      artifact.files[4]!,
    ];
  };

  const context = buildRepairContext({
    report: failedReport(),
    artifact,
    plan: { primaryCta: "Start building", declaredPackages: [] },
    resolveDirectDependencies: resolver,
  });

  assert.deepEqual(context.files.map((file) => file.path), [
    "src/App.tsx",
    "src/index.css",
    "src/Helper.tsx",
  ]);
  assert.doesNotMatch(context.prompt, /src\/components\/Card\.tsx/);
  assert.doesNotMatch(context.prompt, /src\/unrelated\.tsx/);
  assert.match(context.prompt, /Original validated design plan/i);
  assert.match(context.prompt, /Do not delete planned functionality/i);
  assert.match(context.prompt, /focus-visible/i);
});

test("dependency repair accepts a package-only patch and merges it without unrelated file scope", () => {
  const context = buildRepairContext({
    report: {
      static: [],
      responsive: [],
      dependency: { passed: false, evidence: "Missing package: lucide-react" },
      repairEligibility: {
        eligible: true,
        reason: "Missing package: lucide-react",
        failureClass: "dependency",
      },
      finalStatus: "failed",
    },
    artifact,
    plan: { primaryCta: null, declaredPackages: [] },
  });

  const patch = validateStructuredRepairPatch({
    context,
    patch: { files: [], packages: ["lucide-react"] },
  });
  const merged = mergeRepairPatch(artifact, patch);

  assert.deepEqual(context.files, []);
  assert.deepEqual(patch, { files: [], packages: ["lucide-react"] });
  assert.deepEqual(merged.packages, ["lucide-react"]);
  assert.equal(merged.files.length, artifact.files.length);
});

test("visual-fidelity repair context carries every clone axis and terminal reason", () => {
  const context = buildRepairContext({
    report: {
      static: [],
      responsive: [],
      visual: {
        structure: 0.72,
        typography: 0.64,
        color: 0.86,
        spacing: 0.75,
        responsive: 0.69,
        screenshot: 0.88,
      },
      repairEligibility: {
        eligible: true,
        reason: "Clone visual hard gates failed: structure, typography, spacing, responsive.",
        failureClass: "visual-fidelity",
      },
      finalStatus: "failed",
    },
    artifact,
    plan: { primaryCta: null, declaredPackages: [] },
  });

  const visualEvidence = context.failedChecks.find((check) => check.name === "visual-fidelity");
  const reason = context.failedChecks.find((check) => check.name === "repair-eligibility");

  assert.match(visualEvidence?.evidence ?? "", /"typography":0.64/);
  assert.match(visualEvidence?.evidence ?? "", /"responsive":0.69/);
  assert.match(reason?.evidence ?? "", /Clone visual hard gates failed/);
  assert.match(context.prompt, /"structure":0.72/);
  assert.match(context.prompt, /Clone visual hard gates failed/);
});

test("repair patch rejects unsafe and out-of-scope file edits", () => {
  const context = buildRepairContext({
    report: failedReport(),
    artifact,
    plan: { primaryCta: null, declaredPackages: [] },
  });

  assert.throws(
    () => validateStructuredRepairPatch({
      context,
      patch: { files: [{ path: "../escape.ts", content: "export {};" }], packages: [] },
    }),
    /unsafe file path/i,
  );
  assert.throws(
    () => validateStructuredRepairPatch({
      context,
      patch: { files: [{ path: "src/unrelated.tsx", content: "export {};" }], packages: [] },
    }),
    /outside the repair scope/i,
  );
});

test("repair policy classifies every documented failure class", () => {
  for (const failureClass of REPAIRABLE_FAILURE_CLASSES) {
    assert.equal(isRepairEligibleFailure(failureClass), true, `${failureClass} must be repair eligible`);
  }

  for (const failureClass of INELIGIBLE_REPAIR_FAILURE_CLASSES) {
    assert.equal(isRepairEligibleFailure(failureClass), false, `${failureClass} must not be repair eligible`);
  }
});

test("repair cycle claims once, applies a scoped patch, and returns the revalidated final report without persistence", async () => {
  const runLog: string[] = [];
  const generatedContexts: string[][] = [];
  const appliedPatches: GenerationArtifact[] = [];
  const persisted: Array<{ generationId: string; report: ValidationReport; status: string }> = [];
  let claimCalls = 0;

  const orchestrator = createGenerationOrchestrator({
    validation: passingValidationDependencies(runLog),
    repository: {
      persistValidation: async (entry) => {
        persisted.push(entry);
      },
      claimRepairAttempt: async (generationId) => {
        claimCalls += 1;
        return { id: generationId, repairCount: 1 };
      },
    },
    repair: {
      resolveDirectDependencies: () => [artifact.files[1]!],
      generatePatch: async (context) => {
        generatedContexts.push(context.files.map((file) => file.path));
        return {
          files: [{ path: "src/App.tsx", content: "export function App() { return <h1>Repaired</h1>; }" }],
          packages: [],
        };
      },
      validatePatch: (input) => input.patch,
      applyPatch: async ({ patch }) => {
        appliedPatches.push(patch);
      },
    },
  });

  const result = await orchestrator.repairAndRevalidate({
    generation: { id: "generation-1", repairCount: 0 },
    initialReport: failedReport(),
    artifact,
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: "Start building", declaredPackages: [] },
    mode: "scratch",
    sandboxId: "sandbox-1",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
  });

  assert.equal(result.finalStatus, "passed");
  assert.equal(claimCalls, 1);
  assert.deepEqual(generatedContexts, [["src/App.tsx", "src/index.css"]]);
  assert.equal(appliedPatches.length, 1);
  assert.deepEqual(runLog, ["static", "dependency", "build", "browser", "capture", "visual"]);
  assert.equal(persisted.length, 0);
});

test("a failed revalidation is terminal and never starts another repair", async () => {
  const runLog: string[] = [];
  let generatorCalls = 0;
  let claimCalls = 0;
  const persisted: ValidationReport[] = [];

  const orchestrator = createGenerationOrchestrator({
    validation: passingValidationDependencies(runLog, true),
    repository: {
      persistValidation: async ({ report }) => {
        persisted.push(report);
      },
      claimRepairAttempt: async () => {
        claimCalls += 1;
        return { id: "generation-1", repairCount: 1 };
      },
    },
    repair: {
      generatePatch: async () => {
        generatorCalls += 1;
        return { files: [{ path: "src/App.tsx", content: "export function App() { return <h1>Still bad</h1>; }" }], packages: [] };
      },
      validatePatch: (input) => input.patch,
      applyPatch: async () => undefined,
    },
  });

  const result = await orchestrator.repairAndRevalidate({
    generation: { id: "generation-1", repairCount: 0 },
    initialReport: failedReport(),
    artifact,
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "scratch",
    sandboxId: "sandbox-1",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
  });

  assert.equal(result.finalStatus, "failed");
  assert.equal(result.repairEligibility?.eligible, false);
  assert.match(result.repairEligibility?.reason ?? "", /automatic repair attempt has already been used/i);
  assert.equal(claimCalls, 1);
  assert.equal(generatorCalls, 1);
  assert.equal(persisted.length, 0);
  assert.deepEqual(runLog, ["static", "dependency", "build", "browser", "capture", "visual"]);
});

test("post-claim generator, patch, applier, and revalidation errors return one non-retryable terminal report without persistence", async () => {
  const cases = [
    {
      name: "generator",
      generatePatch: async (): Promise<GenerationArtifact> => {
        throw new Error("repair model unavailable");
      },
      applyPatch: async (): Promise<void> => undefined,
      brief: { contentFacts: [], allowedPlaceholders: [] },
    },
    {
      name: "patch validation",
      generatePatch: async (): Promise<GenerationArtifact> => ({
        files: [{ path: "src/unrelated.tsx", content: "export {};" }],
        packages: [],
      }),
      applyPatch: async (): Promise<void> => undefined,
      brief: { contentFacts: [], allowedPlaceholders: [] },
    },
    {
      name: "applier",
      generatePatch: async (): Promise<GenerationArtifact> => ({
        files: [{ path: "src/App.tsx", content: "export function App() { return <h1>Repaired</h1>; }" }],
        packages: [],
      }),
      applyPatch: async (): Promise<void> => {
        throw new Error("sandbox apply failed");
      },
      brief: { contentFacts: [], allowedPlaceholders: [] },
    },
    {
      name: "revalidation",
      generatePatch: async (): Promise<GenerationArtifact> => ({
        files: [{ path: "src/App.tsx", content: "export function App() { return <h1>Repaired</h1>; }" }],
        packages: [],
      }),
      applyPatch: async (): Promise<void> => undefined,
      brief: { contentFacts: [1] as never, allowedPlaceholders: [] },
    },
  ] as const;

  for (const failure of cases) {
    const runLog: string[] = [];
    const persisted: ValidationReport[] = [];
    let claimCalls = 0;
    let generatorCalls = 0;
    const orchestrator = createGenerationOrchestrator({
      validation: passingValidationDependencies(runLog),
      repository: {
        persistValidation: async ({ report }) => {
          persisted.push(report);
        },
        claimRepairAttempt: async () => {
          claimCalls += 1;
          return { id: "generation-1", repairCount: 1 };
        },
      },
      repair: {
        generatePatch: async (context) => {
          generatorCalls += 1;
          return failure.generatePatch(context);
        },
        applyPatch: failure.applyPatch,
      },
    });

    const result = await orchestrator.repairAndRevalidate({
      generation: { id: "generation-1", repairCount: 0 },
      initialReport: failedReport(),
      artifact,
      brief: failure.brief,
      plan: { primaryCta: null, declaredPackages: [] },
      mode: "scratch",
      sandboxId: "sandbox-1",
      sandboxUrl: "https://sandbox.example.test",
      desktopWidth: 1440,
    });

    assert.equal(result.finalStatus, "failed", `${failure.name} must be terminal`);
    assert.equal(result.repairEligibility?.eligible, false, `${failure.name} must not retry`);
    assert.equal(claimCalls, 1, `${failure.name} must claim exactly once`);
    assert.equal(generatorCalls, 1, `${failure.name} must generate at most once`);
    assert.equal(persisted.length, 0, `${failure.name} must not persist outside the activation boundary`);
  }
});

test("a generation that has already repaired rejects before claiming or generating again", async () => {
  const runLog: string[] = [];
  let generatorCalls = 0;
  let claimCalls = 0;

  const orchestrator = createGenerationOrchestrator({
    validation: passingValidationDependencies(runLog),
    repository: {
      persistValidation: async () => undefined,
      claimRepairAttempt: async () => {
        claimCalls += 1;
        return { id: "generation-1", repairCount: 1 };
      },
    },
    repair: {
      generatePatch: async () => {
        generatorCalls += 1;
        return { files: [], packages: [] };
      },
      validatePatch: (input) => input.patch,
      applyPatch: async () => undefined,
    },
  });

  await assert.rejects(
    () => orchestrator.repairAndRevalidate({
      generation: { id: "generation-1", repairCount: 1 },
      initialReport: failedReport(),
      artifact,
      brief: { contentFacts: [], allowedPlaceholders: [] },
      plan: { primaryCta: null, declaredPackages: [] },
      mode: "scratch",
      sandboxId: "sandbox-1",
      sandboxUrl: "https://sandbox.example.test",
      desktopWidth: 1440,
    }),
    RepairLimitError,
  );

  assert.equal(claimCalls, 0);
  assert.equal(generatorCalls, 0);
  assert.deepEqual(runLog, []);
});

test("repository conditionally claims one repair attempt under concurrent requests", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-repair-claim-test", ""],
  );
  const generationId = randomUUID();

  try {
    await createGeneration({
      id: generationId,
      projectId: String(project.rows[0].id),
      mode: "scratch",
      prompt: "Build a newsroom",
      targetUrl: null,
      userId: null,
    });

    const claims = await Promise.all([
      claimGenerationRepairAttempt(generationId),
      claimGenerationRepairAttempt(generationId),
    ]);

    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)?.repairCount, 1);
    assert.equal((await getGeneration(generationId))?.repairCount, 1);
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});
