import assert from "node:assert/strict";
import test from "node:test";

import {
  ValidationStepError,
  runValidation,
} from "../../lib/generation/validation/validation-runner";
import { createGenerationOrchestrator } from "../../lib/generation/orchestration/generation-orchestrator";

type FixtureOptions = {
  runtimePassed?: boolean;
  visualScore?: number;
  buildPassed?: boolean;
  captureFailureClass?: "capture-policy" | "provider-unavailable";
};

function validationFixture(options: FixtureOptions = {}) {
  const order: string[] = [];
  const runtimePassed = options.runtimePassed ?? true;
  const visualScore = options.visualScore ?? 0.98;
  const buildPassed = options.buildPassed ?? true;

  return {
    order,
    input: {
      artifact: {
        files: [{ path: "src/App.tsx", content: "export function App() { return <h1>Studio</h1>; }" }],
        packages: [],
      },
      brief: { contentFacts: [], allowedPlaceholders: [] },
      plan: { primaryCta: null, declaredPackages: [] },
      mode: "clone" as const,
      sandboxId: "sandbox-1",
      sandboxUrl: "https://sandbox.example.test",
      reference: { source: "clone-reference" },
    },
    dependencies: {
      validateStatic: () => {
        order.push("static");
        return [];
      },
      validateDependencies: () => {
        order.push("dependency");
        return {
          artifactPackages: [],
          templatePackages: [],
          declaredPackages: [],
          imports: [],
          missingPackages: [],
        };
      },
      validateBuild: async () => {
        order.push("build");
        return {
          passed: buildPassed,
          evidence: buildPassed ? "build passed" : "build failed",
          stdout: "",
          stderr: buildPassed ? "" : "compile error",
          exitCode: buildPassed ? 0 : 1,
          timedOut: false,
        };
      },
      validateBrowser: async () => {
        order.push("browser");
        return {
          runtime: { passed: runtimePassed, evidence: runtimePassed ? "runtime passed" : "runtime error" },
          responsive: [320, 375, 414, 768, 1440].map((width) => ({
            width,
            horizontalOverflow: false,
            passed: true,
            evidence: `${width}px passed`,
          })),
          keyboard: { passed: true, evidence: "keyboard passed" },
          reducedMotion: { passed: true, evidence: "motion passed" },
          accessibility: { passed: true, evidence: "accessibility passed" },
          passed: runtimePassed,
        };
      },
      captureOutput: async () => {
        order.push("capture");
        if (options.captureFailureClass) {
          throw new ValidationStepError(options.captureFailureClass, "Capture is blocked by policy.");
        }
        return { output: "captured-output" };
      },
      evaluateVisual: async () => {
        order.push("visual");
        return {
          mode: "clone" as const,
          visual: {
            structure: visualScore,
            typography: visualScore,
            color: visualScore,
            spacing: visualScore,
            responsive: visualScore,
            screenshot: visualScore,
          },
        };
      },
    },
  };
}

test("a runtime failure keeps final status failed even when visual scores pass", async () => {
  const fixture = validationFixture({ runtimePassed: false, visualScore: 0.98 });

  const report = await runValidation(fixture.input, fixture.dependencies);

  assert.equal(report.finalStatus, "failed");
  assert.equal(report.runtime?.passed, false);
  assert.equal(report.visual?.screenshot, 0.98);
  assert.equal(report.repairEligibility?.eligible, true);
  assert.match(report.repairEligibility?.reason ?? "", /runtime/i);
  assert.deepEqual(fixture.order, ["static", "dependency", "build", "browser", "capture", "visual"]);
});

test("policy failures are not repair eligible", async () => {
  const fixture = validationFixture({ captureFailureClass: "capture-policy" });

  const report = await runValidation(fixture.input, fixture.dependencies);

  assert.equal(report.finalStatus, "failed");
  assert.equal(report.capture?.passed, false);
  assert.equal(report.repairEligibility?.eligible, false);
  assert.equal(report.repairEligibility?.failureClass, "capture-policy");
  assert.ok(report.skipped?.some((item) => item.step === "visual" && /capture/i.test(item.reason)));
  assert.deepEqual(fixture.order, ["static", "dependency", "build", "browser", "capture"]);
});

test("a build failure persists one partial report and skips browser and capture gates", async () => {
  const fixture = validationFixture({ buildPassed: false });
  const persisted: Array<{ generationId: string; report: unknown; status: string }> = [];
  const orchestrator = createGenerationOrchestrator({
    validation: fixture.dependencies,
    repository: {
      persistValidation: async (entry) => {
        persisted.push(entry);
      },
    },
  });

  const report = await orchestrator.validateAndPersist({
    generationId: "generation-1",
    ...fixture.input,
  });

  assert.equal(report.finalStatus, "failed");
  assert.equal(report.compile?.passed, false);
  assert.ok(report.skipped?.some((item) => item.step === "browser" && /build/i.test(item.reason)));
  assert.ok(report.skipped?.some((item) => item.step === "capture" && /build/i.test(item.reason)));
  assert.ok(report.skipped?.some((item) => item.step === "visual" && /build/i.test(item.reason)));
  assert.deepEqual(fixture.order, ["static", "dependency", "build"]);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.generationId, "generation-1");
  assert.equal(persisted[0]?.status, "failed");
  assert.equal((persisted[0]?.report as { finalStatus?: string }).finalStatus, "failed");
});
