import assert from "node:assert/strict";
import test from "node:test";

import {
  createLiveCandidateMutationBarrier,
  emitLiveActivationTerminalEvents,
  snapshotLegacyCandidateMutationState,
  writeLiveCandidateFile,
} from "../../lib/generation/live/live-apply-terminal";
import {
  createLiveValidationActivation,
  LiveActivationPersistenceError,
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

test("a terminal persistence rejection after rollback still produces the safe failed apply sequence", async () => {
  const files = new Map([["src/App.tsx", "before"]]);
  const provider = {
    getSandboxInfo: () => ({
      sandboxId: "sandbox-live-persist-failure",
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
      files.set(path, content);
    },
    runCommand: async (command: string) => {
      const remove = command.match(/^rm -f -- (.+)$/);
      if (remove) files.delete(remove[1]);
      return { stdout: "", stderr: "", exitCode: 0, success: true };
    },
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
  const failedReport: ValidationReport = {
    static: [],
    responsive: [],
    repairEligibility: { eligible: false, reason: "Runtime validation failed." },
    finalStatus: "failed",
  };
  let persistenceCalls = 0;
  const orchestrator: LiveValidationOrchestrator = {
    validate: async () => failedReport,
    repairAndRevalidate: async () => failedReport,
    persistFinal: async () => {
      persistenceCalls += 1;
      throw new Error("database connection interrupted");
    },
  };
  const activation = createLiveValidationActivation({ sandbox, orchestrator });
  const candidateMutation = createLiveCandidateMutationBarrier();
  const activationPromise = activation.activate({
    artifact: { files: [{ path: "src/App.tsx", content: "candidate" }], packages: [] },
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "scratch",
    sandboxId: "sandbox-live-persist-failure",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
    generation: { id: "generation-live-persist-failure", projectId: "project-1", repairCount: 0 },
    snapshotPaths: ["src/App.tsx"],
    applyCandidate: candidateMutation.applyCandidate,
  });
  await candidateMutation.waitUntilStarted();
  await writeLiveCandidateFile({ provider, path: "src/App.tsx", content: "candidate" });
  candidateMutation.complete();

  let rejection: LiveActivationPersistenceError | undefined;
  await assert.rejects(activationPromise, (error: unknown) => {
    assert.ok(error instanceof LiveActivationPersistenceError);
    rejection = error;
    return true;
  });

  const events: Array<{ type: string }> = [];
  const emittedComplete = await emitLiveActivationTerminalEvents({
    result: rejection!.result,
    send: async (event) => {
      events.push(event);
    },
    failureMessage: "The sandbox could not complete deterministic validation.",
  });

  assert.equal(files.get("src/App.tsx"), "before");
  assert.equal(persistenceCalls, 1);
  assert.equal(rejection!.result.status, "failed");
  assert.equal(rejection!.result.rolledBack, true);
  assert.equal(emittedComplete, false);
  assert.deepEqual(events.map((event) => event.type), [
    "validation-report",
    "rollback-started",
    "rollback-complete",
    "error",
  ]);
});

test("a partial candidate write restores the relevant legacy cache and tracked file membership", async () => {
  const files = new Map([["src/App.tsx", "before"]]);
  const provider = {
    getSandboxInfo: () => ({
      sandboxId: "sandbox-live-partial-write",
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
      if (path === "src/Fail.tsx") throw new Error("second write rejected");
      files.set(path, content);
    },
    runCommand: async (command: string) => {
      const remove = command.match(/^rm -f -- (.+)$/);
      if (remove) files.delete(remove[1]);
      return { stdout: "", stderr: "", exitCode: 0, success: true };
    },
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
  const originalCacheEntry = { content: "before", lastModified: 1 };
  const sandboxState = { fileCache: { files: { "src/App.tsx": originalCacheEntry } } };
  const existingFiles = new Set(["src/App.tsx"]);
  const legacyState = snapshotLegacyCandidateMutationState({
    sandboxState,
    existingFiles,
    paths: ["src/App.tsx", "src/New.tsx", "src/Fail.tsx"],
  });
  let persistenceCalls = 0;
  const orchestrator: LiveValidationOrchestrator = {
    validate: async () => passedReport,
    repairAndRevalidate: async () => passedReport,
    persistFinal: async () => {
      persistenceCalls += 1;
    },
  };
  const activation = createLiveValidationActivation({ sandbox, orchestrator });
  const candidateMutation = createLiveCandidateMutationBarrier();
  const activationPromise = activation.activate({
    artifact: {
      files: [
        { path: "src/App.tsx", content: "candidate app" },
        { path: "src/New.tsx", content: "candidate new" },
        { path: "src/Fail.tsx", content: "candidate fail" },
      ],
      packages: [],
    },
    brief: { contentFacts: [], allowedPlaceholders: [] },
    plan: { primaryCta: null, declaredPackages: [] },
    mode: "scratch",
    sandboxId: "sandbox-live-partial-write",
    sandboxUrl: "https://sandbox.example.test",
    desktopWidth: 1440,
    generation: { id: "generation-live-partial-write", projectId: "project-1", repairCount: 0 },
    snapshotPaths: ["src/App.tsx", "src/New.tsx", "src/Fail.tsx"],
    applyCandidate: candidateMutation.applyCandidate,
  });
  await candidateMutation.waitUntilStarted();
  try {
    await writeLiveCandidateFile({ provider, path: "src/App.tsx", content: "candidate app" });
    legacyState.recordWrite("src/App.tsx", "candidate app");
    await writeLiveCandidateFile({ provider, path: "src/New.tsx", content: "candidate new" });
    legacyState.recordWrite("src/New.tsx", "candidate new");
    await writeLiveCandidateFile({ provider, path: "src/Fail.tsx", content: "candidate fail" });
    candidateMutation.complete();
  } catch (error) {
    candidateMutation.fail(error);
  }
  const result = await activationPromise;
  legacyState.restore();

  assert.equal(result.status, "failed");
  assert.equal(result.rolledBack, true);
  assert.equal(files.get("src/App.tsx"), "before");
  assert.equal(files.has("src/New.tsx"), false);
  assert.equal(persistenceCalls, 1);
  assert.strictEqual(sandboxState.fileCache.files["src/App.tsx"], originalCacheEntry);
  assert.equal("src/New.tsx" in sandboxState.fileCache.files, false);
  assert.equal(existingFiles.has("src/App.tsx"), true);
  assert.equal(existingFiles.has("src/New.tsx"), false);
});
