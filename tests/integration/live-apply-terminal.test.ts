import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveCandidateMutationBarrier,
  emitLiveActivationTerminalEvents,
  writeLiveCandidateFile,
} from "../../lib/generation/live/live-apply-terminal";
import {
  createLiveValidationActivation,
  type LiveValidationOrchestrator,
} from "../../lib/generation/live/live-validation-activation";
import type { ValidationReport } from "../../lib/generation/contracts/validation";
import { createSandboxService } from "../../lib/sandbox/service/sandbox-service";
import type { SandboxProvider } from "../../lib/sandbox/types";

const passedReport: ValidationReport = {
  static: [],
  responsive: [],
  repairEligibility: { eligible: false, reason: "All required validation hard gates passed." },
  finalStatus: "passed",
};

test("a provider write failure rolls back once, persists once, and cannot emit apply complete", async () => {
  const files = new Map([["src/App.tsx", "before"]]);
  const writes: Array<{ path: string; content: string }> = [];
  const provider = {
    getSandboxInfo: () => ({
      sandboxId: "sandbox-live-write-failure",
      url: "https://sandbox.example.test",
      provider: "e2b" as const,
      createdAt: new Date(),
    }),
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error("ENOENT");
      return value;
    },
    writeFile: async (path: string, content: string) => {
      writes.push({ path, content });
      if (content === "candidate") throw new Error("provider write rejected candidate");
      files.set(path, content);
    },
    runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0, success: true }),
  } as unknown as SandboxProvider;
  const sandbox = createSandboxService({
    providers: {
      allocate: async () => {
        throw new Error("not used");
      },
      connect: async () => provider,
    },
    leases: {},
  });
  const persisted: Array<{ status?: string }> = [];
  let validationCalls = 0;
  let repairCalls = 0;
  const orchestrator: LiveValidationOrchestrator = {
    validate: async () => {
      validationCalls += 1;
      return passedReport;
    },
    repairAndRevalidate: async () => {
      repairCalls += 1;
      return passedReport;
    },
    persistFinal: async (entry) => {
      persisted.push({ status: entry.status });
    },
  };
  const activation = createLiveValidationActivation({ sandbox, orchestrator });
  const candidateMutation = createLiveCandidateMutationBarrier();
  const activationPromise = activation.activate({
    artifact: { files: [{ path: "src/App.tsx", content: "candidate" }], packages: [] },
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "scratch",
    sandboxId: "sandbox-live-write-failure",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
    generation: { id: "generation-live-write-failure", projectId: "project-1", repairCount: 0 },
    snapshotPaths: ["src/App.tsx"],
    applyCandidate: candidateMutation.applyCandidate,
  });
  await candidateMutation.waitUntilStarted();
  try {
    await writeLiveCandidateFile({
      provider,
      path: "src/App.tsx",
      content: "candidate",
    });
    candidateMutation.complete();
  } catch (error) {
    candidateMutation.fail(error);
  }
  const result = await activationPromise;

  const events: Array<{ type: string }> = [];
  const emittedComplete = await emitLiveActivationTerminalEvents({
    result,
    send: async (event) => {
      events.push(event);
    },
    failureMessage: "The candidate could not be applied and validated safely.",
  });

  assert.equal(result.status, "failed");
  assert.equal(result.rolledBack, true);
  assert.equal(files.get("src/App.tsx"), "before");
  assert.deepEqual(writes, [
    { path: "src/App.tsx", content: "candidate" },
    { path: "src/App.tsx", content: "before" },
  ]);
  assert.equal(validationCalls, 0);
  assert.equal(repairCalls, 0);
  assert.deepEqual(persisted, [{ status: "failed" }]);
  assert.equal(emittedComplete, false);
  assert.deepEqual(events.map((event) => event.type), [
    "validation-report",
    "rollback-started",
    "rollback-complete",
    "error",
  ]);
  assert.equal(events.some((event) => event.type === "complete"), false);
});
