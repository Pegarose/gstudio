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
  type ValidationRunInput,
} from "../../lib/generation/validation/validation-runner";
import type { SandboxFileSnapshot, SandboxService } from "../../lib/sandbox/service/contracts";

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
  };
  const repair = { generateCalls: 0 };
  const initialReport = options.initialReport
    ?? (((options.mode === "clone" || options.mode === "inspiration") && !options.reference)
      ? capturePolicyReport
      : failedRuntimeReport);
  const orchestrator: LiveValidationOrchestrator = {
    validate: async () => initialReport,
    repairAndRevalidate: async () => {
      repair.generateCalls += 1;
      return options.repairedReport ?? initialReport;
    },
    persistFinal: async (entry) => {
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
