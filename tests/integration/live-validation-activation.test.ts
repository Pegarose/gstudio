import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveValidationActivation,
  type LiveValidationOrchestrator,
} from "../../lib/generation/live/live-validation-activation";
import { createProductionValidationDependencies } from "../../lib/generation/live/production-validation";
import type {
  GenerationArtifact,
  ValidationReport,
} from "../../lib/generation/contracts/validation";
import {
  ValidationStepError,
  runValidation,
  type ValidationRunInput,
} from "../../lib/generation/validation/validation-runner";
import type { SandboxFileSnapshot, SandboxService } from "../../lib/sandbox/service/contracts";
import type { CapturedVisualEvidenceBundle } from "../../lib/generation/validation/visual-evaluator";
import { createVisualFixtures } from "../fixtures/visual/visual-fixtures";

const artifact: GenerationArtifact = {
  files: [{
    path: "src/App.tsx",
    content: "export function App() { return <h1>Studio</h1>; }",
  }],
  packages: [],
};

const passedReport: ValidationReport = {
  static: [],
  responsive: [],
  repairEligibility: {
    eligible: false,
    reason: "All required validation hard gates passed.",
  },
  finalStatus: "passed",
};

const failedRuntimeReport: ValidationReport = {
  static: [],
  responsive: [],
  runtime: { passed: false, evidence: "pageerror: boom" },
  repairEligibility: {
    eligible: true,
    failureClass: "runtime",
    reason: "Runtime validation reported a page error.",
  },
  finalStatus: "failed",
};

const repairableStaticReport: ValidationReport = {
  static: [{
    code: "missing-focus-visible",
    severity: "error",
    file: "src/App.tsx",
    line: 1,
    message: "Interactive controls require a visible focus-visible treatment.",
    evidence: "No focus-visible selector or utility was found.",
  }],
  responsive: [],
  repairEligibility: {
    eligible: true,
    failureClass: "static-rule",
    reason: "Static validation reported error violations.",
  },
  finalStatus: "failed",
};

const capturePolicyReport: ValidationReport = {
  static: [],
  responsive: [],
  repairEligibility: {
    eligible: false,
    failureClass: "capture-policy",
    reason: "Reference evidence unavailable for live fidelity validation.",
  },
  finalStatus: "failed",
};

type FixtureOptions = {
  initialReport?: ValidationReport;
  repairedReport?: ValidationReport;
  mode?: ValidationRunInput["mode"];
  reference?: ValidationRunInput["reference"];
  persistFinalError?: Error;
  validate?: () => Promise<ValidationReport>;
};

function fixture(options: FixtureOptions = {}) {
  const snapshots: SandboxFileSnapshot[] = [{ path: "src/App.tsx", content: "before" }];
  const sandbox = {
    snapshotCalls: [] as string[][],
    restoreCalls: [] as string[][],
    service: {
      snapshotFiles: async (_sandboxId: string, paths: string[]) => {
        sandbox.snapshotCalls.push(paths);
        return snapshots;
      },
      restoreFiles: async (_sandboxId: string, values: SandboxFileSnapshot[]) => {
        sandbox.restoreCalls.push(values.map((value) => value.path));
      },
    } satisfies Pick<SandboxService, "snapshotFiles" | "restoreFiles">,
  };
  const repository = {
    persisted: [] as Array<{ generationId: string; report: ValidationReport; status: "passed" | "failed" }>,
    persistenceAttempts: 0,
  };
  const repair = { generateCalls: 0 };
  const initialReport = options.initialReport
    ?? (((options.mode === "clone" || options.mode === "inspiration") && !options.reference)
      ? capturePolicyReport
      : failedRuntimeReport);
  const orchestrator: LiveValidationOrchestrator = {
    validate: options.validate ?? (async () => initialReport),
    repairAndRevalidate: async () => {
      repair.generateCalls += 1;
      return options.repairedReport ?? initialReport;
    },
    persistFinal: async (entry) => {
      repository.persistenceAttempts += 1;
      if (options.persistFinalError) {
        throw options.persistFinalError;
      }
      repository.persisted.push(entry);
    },
  };
  const activation = createLiveValidationActivation({ sandbox: sandbox.service, orchestrator });

  return {
    activation,
    sandbox,
    repository,
    repair,
    input: {
      artifact,
      brief: { contentFacts: [], allowedPlaceholders: [] },
      plan: { primaryCta: null, declaredPackages: [] },
      mode: options.mode ?? "scratch",
      sandboxId: "sandbox-1",
      sandboxUrl: "https://sandbox.example.test",
      desktopWidth: 1440,
      reference: options.reference,
      generation: { id: "generation-1", projectId: "project-1", repairCount: 0 },
      snapshotPaths: ["src/App.tsx"],
      applyCandidate: async () => undefined,
    } satisfies Parameters<typeof activation.activate>[0],
  };
}

test("failed deterministic validation restores the sandbox and persists one failed report", async () => {
  const subject = fixture({ initialReport: failedRuntimeReport, repairedReport: failedRuntimeReport });

  const result = await subject.activation.activate(subject.input);

  assert.equal(result.status, "failed");
  assert.equal(result.rolledBack, true);
  assert.deepEqual(subject.sandbox.restoreCalls, [["src/App.tsx"]]);
  assert.equal(subject.repository.persisted.length, 1);
  assert.equal(subject.repository.persisted[0]?.status, "failed");
  assert.equal(result.report.repairEligibility?.eligible, false);
});

test("a repair that passes revalidation keeps the repair and persists passed once", async () => {
  const subject = fixture({
    initialReport: repairableStaticReport,
    repairedReport: passedReport,
  });

  const result = await subject.activation.activate(subject.input);

  assert.equal(result.status, "passed");
  assert.equal(result.rolledBack, false);
  assert.equal(subject.repair.generateCalls, 1);
  assert.deepEqual(subject.sandbox.restoreCalls, []);
  assert.equal(subject.repository.persisted.length, 1);
  assert.equal(subject.repository.persisted[0]?.status, "passed");
});

test("a passed report rolls back once and rejects when terminal persistence fails", async () => {
  const subject = fixture({
    initialReport: passedReport,
    persistFinalError: new Error("terminal persistence unavailable"),
  });

  await assert.rejects(
    () => subject.activation.activate(subject.input),
    /terminal persistence unavailable/,
  );

  assert.deepEqual(subject.sandbox.restoreCalls, [["src/App.tsx"]]);
  assert.equal(subject.repository.persistenceAttempts, 1);
  assert.deepEqual(subject.repository.persisted, []);
});

test("missing clone or inspiration reference evidence fails without calling repair", async () => {
  for (const mode of ["clone", "inspiration"] as const) {
    const subject = fixture({ mode, reference: undefined });

    const result = await subject.activation.activate(subject.input);

    assert.equal(result.status, "failed");
    assert.equal(result.report.repairEligibility?.failureClass, "capture-policy");
    assert.equal(subject.repair.generateCalls, 0);
  }
});

test("production validation refuses clone and inspiration fidelity checks without durable reference evidence", async () => {
  const dependencies = createProductionValidationDependencies({
    sandbox: {
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", success: true }),
    },
    captureOutput: async () => ({ output: "captured" }),
    readPng: async () => Buffer.alloc(0),
    validateBrowser: async () => ({
      runtime: { passed: true, evidence: "runtime passed" },
      responsive: [],
      keyboard: { passed: true, evidence: "keyboard passed" },
      reducedMotion: { passed: true, evidence: "motion passed" },
      accessibility: { passed: true, evidence: "accessibility passed" },
      passed: true,
    }),
  });

  for (const mode of ["clone", "inspiration"] as const) {
    await assert.rejects(
      () => dependencies.evaluateVisual({
        artifact,
        brief: { contentFacts: [], allowedPlaceholders: [] },
        plan: { primaryCta: null, declaredPackages: [] },
        mode,
        sandboxId: "sandbox-1",
        sandboxUrl: "https://sandbox.example.test",
        desktopWidth: 1440,
        capture: { output: "captured" },
      }),
      (error: unknown) => error instanceof ValidationStepError
        && error.failureClass === "capture-policy"
        && error.message === "Reference evidence unavailable for live fidelity validation.",
    );
  }
});

test("production clone validation reports missing reference evidence as capture-policy through the runner", async () => {
  const dependencies = createProductionValidationDependencies({
    sandbox: {
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", success: true }),
    },
    captureOutput: async () => ({ output: "captured" }),
    readPng: async () => Buffer.alloc(0),
    validateBrowser: async () => ({
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
    }),
  });

  const report = await runValidation({
    artifact,
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "clone",
    sandboxId: "sandbox-1",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
  }, dependencies);

  assert.equal(report.finalStatus, "failed");
  assert.equal(report.repairEligibility?.eligible, false);
  assert.equal(report.repairEligibility?.failureClass, "capture-policy");
});

test("unreadable durable clone source artifacts fail capture-policy without starting repair", async () => {
  const { source, output } = createVisualFixtures();
  const sourceReference = durableCloneReference(source, "source");
  const outputCapture = capturedVisualEvidence(output, "output");
  const dependencies = createProductionValidationDependencies({
    sandbox: {
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", success: true }),
    },
    captureOutput: async () => ({ output: outputCapture }),
    readPng: async (image) => {
      if (image.artifactKey.startsWith("source-")) {
        throw new Error("source artifact store read rejected");
      }
      return image.artifactKey === "output-desktop" ? output.desktopScreenshot.png : output.mobileScreenshot.png;
    },
    validateBrowser: async () => passingBrowserReport(),
  });
  const validationInput: ValidationRunInput = {
    artifact,
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "clone",
    sandboxId: "sandbox-1",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
    reference: sourceReference,
  };
  const subject = fixture({
    mode: "clone",
    reference: sourceReference,
    validate: () => runValidation(validationInput, dependencies),
  });

  const result = await subject.activation.activate(subject.input);

  assert.equal(result.status, "failed");
  assert.equal(result.report.repairEligibility?.eligible, false);
  assert.equal(result.report.repairEligibility?.failureClass, "capture-policy");
  assert.equal(subject.repair.generateCalls, 0);
  assert.equal(subject.repository.persisted.length, 1);
  assert.equal(subject.repository.persisted[0]?.status, "failed");
  assert.deepEqual(subject.sandbox.restoreCalls, [["src/App.tsx"]]);
});

test("production validation rejects raw clone buffers and bare inspiration checks without durable provenance", async () => {
  const dependencies = createProductionValidationDependencies({
    sandbox: {
      runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "", success: true }),
    },
    captureOutput: async () => ({ output: "captured" }),
    readPng: async () => Buffer.alloc(0),
    validateBrowser: async () => ({
      runtime: { passed: true, evidence: "runtime passed" },
      responsive: [],
      keyboard: { passed: true, evidence: "keyboard passed" },
      reducedMotion: { passed: true, evidence: "motion passed" },
      accessibility: { passed: true, evidence: "accessibility passed" },
      passed: true,
    }),
  });
  const { source, output } = createVisualFixtures();
  const common = {
    artifact,
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    sandboxId: "sandbox-1",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
  };

  await assert.rejects(
    () => dependencies.evaluateVisual({
      ...common,
      mode: "clone",
      reference: { source } as unknown as ValidationRunInput["reference"],
      capture: { output },
    }),
    (error: unknown) => error instanceof ValidationStepError
      && error.failureClass === "capture-policy",
  );

  await assert.rejects(
    () => dependencies.evaluateVisual({
      ...common,
      mode: "inspiration",
      reference: {
        brandLanguage: { passed: true, evidence: "A bare result is not a durable bundle." },
      } as unknown as ValidationRunInput["reference"],
      capture: { output: "captured" },
    }),
    (error: unknown) => error instanceof ValidationStepError
      && error.failureClass === "capture-policy",
  );
});

function durableCloneReference(
  bundle: ReturnType<typeof createVisualFixtures>["source"],
  keyPrefix: string,
): ValidationRunInput["reference"] {
  return {
    source: {
      kind: "clone-reference-v1",
      captureId: "capture-1",
      sourceUrl: "https://example.test",
      capturedAt: "2026-07-14T00:00:00.000Z",
      ...capturedVisualEvidence(bundle, keyPrefix),
    },
  };
}

function capturedVisualEvidence(
  bundle: ReturnType<typeof createVisualFixtures>["source"],
  keyPrefix: string,
): CapturedVisualEvidenceBundle {
  return {
    desktopScreenshot: {
      artifactKey: `${keyPrefix}-desktop`,
      mediaType: "image/png",
      width: bundle.desktopScreenshot.viewport.width,
      height: bundle.desktopScreenshot.viewport.height,
      devicePixelRatio: bundle.desktopScreenshot.viewport.devicePixelRatio,
    },
    mobileScreenshot: {
      artifactKey: `${keyPrefix}-mobile`,
      mediaType: "image/png",
      width: bundle.mobileScreenshot.viewport.width,
      height: bundle.mobileScreenshot.viewport.height,
      devicePixelRatio: bundle.mobileScreenshot.viewport.devicePixelRatio,
    },
    desktopLayout: bundle.desktopLayout,
    mobileLayout: bundle.mobileLayout,
  };
}

function passingBrowserReport() {
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
}
