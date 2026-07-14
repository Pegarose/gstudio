import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  POST as applyGeneratedCandidate,
} from "../../app/api/apply-ai-code-stream/route";
import { createApplyAiCodeStreamRoute } from "../../lib/generation/live/apply-ai-code-stream-route";
import {
  createLiveValidationActivation,
  LiveActivationPersistenceError,
} from "../../lib/generation/live/live-validation-activation";
import type { ValidationReport } from "../../lib/generation/contracts/validation";

const candidate = '<file path="src/App.jsx">export default function App() { return <main>Ready</main>; }</file>';

const validGenerationContext = {
  generationId: "00000000-0000-4000-8000-000000000010",
  projectId: "project-1",
  mode: "scratch" as const,
  prompt: "Create a safe page",
  targetUrl: null,
};

const failedReport: ValidationReport = {
  static: [],
  responsive: [],
  repairEligibility: {
    eligible: false,
    failureClass: "sandbox-infrastructure",
    reason: "Provider rejected the candidate write.",
  },
  finalStatus: "failed",
};

const failedActivationResult = {
  status: "failed" as const,
  report: failedReport,
  rolledBack: true,
};

function createRouteProvider(options: { rejectPath?: string } = {}) {
  const writes: string[] = [];
  return {
    writes,
    provider: {
      getSandboxInfo: () => ({
        sandboxId: "sandbox-route-test",
        url: "https://sandbox.example.test",
        provider: "e2b" as const,
        createdAt: new Date(),
      }),
      writeFile: async (path: string) => {
        writes.push(path);
        if (path === options.rejectPath) {
          throw new Error("provider write rejected");
        }
      },
      runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0, success: true }),
      restartViteServer: async () => undefined,
      installPackages: async () => ({ success: true, installedPackages: [] }),
    },
  };
}

function createRoutePersistence(options: { rejectTerminalPersist?: boolean } = {}) {
  const calls = {
    resolve: 0,
    prepare: 0,
    terminal: 0,
    repair: 0,
  };
  return {
    calls,
    persistence: {
      resolveGeneration: async () => {
        calls.resolve += 1;
        return { id: validGenerationContext.generationId, projectId: "project-1", repairCount: 0 };
      },
      prepareActivation: async () => {
        calls.prepare += 1;
      },
      persistValidation: async () => {
        calls.terminal += 1;
        if (options.rejectTerminalPersist) {
          throw new Error("terminal persistence rejected");
        }
      },
      claimRepairAttempt: async () => {
        calls.repair += 1;
        return null;
      },
    },
  };
}

async function consumeSse(response: Response): Promise<Array<{ type: string; [key: string]: unknown }>> {
  assert.ok(response.body);
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string; [key: string]: unknown });
}

async function consumeSseBeforeTimeout(response: Response, timeoutMs = 250) {
  return Promise.race([
    consumeSse(response),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("apply SSE did not close")), timeoutMs);
    }),
  ]);
}

test("apply route rejects an unscoped generated candidate", async () => {
  const response = await applyGeneratedCandidate(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response: candidate, sandboxId: "sandbox-1" }),
  }) as never);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /generation context/i);
});

test("apply route rejects a traversal candidate before it can reach live activation", async () => {
  let providerCalls = 0;
  let activationCalls = 0;
  const { persistence, calls } = createRoutePersistence();
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async () => {
      providerCalls += 1;
      return undefined;
    },
    persistence,
    createActivation: () => {
      activationCalls += 1;
      throw new Error("live activation must not start for traversal input");
    },
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: '<file path="src/a/../../package.json">{"private":false}</file>',
      sandboxId: "sandbox-1",
      generationContext: {
        generationId: "00000000-0000-4000-8000-000000000001",
        projectId: "project-1",
        mode: "scratch",
        prompt: "Create a safe page",
        targetUrl: null,
      },
    }),
  }) as never);

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /unsafe generated file path/i);
  assert.doesNotMatch(JSON.stringify(body), /complete/i);
  assert.equal(providerCalls, 0);
  assert.deepEqual(calls, { resolve: 0, prepare: 0, terminal: 0, repair: 0 });
  assert.equal(activationCalls, 0);
});

test("production apply route closes with rollback events after a partial provider write", async () => {
  const { provider, writes } = createRouteProvider({ rejectPath: "src/Fail.tsx" });
  const { persistence, calls } = createRoutePersistence();
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async () => provider as never,
    persistence,
    createActivation: ({ persistence: activationPersistence }) => ({
      activate: async (input) => {
        try {
          await input.applyCandidate();
        } catch {
          await activationPersistence.persistValidation({
            generationId: input.generation.id,
            report: failedReport,
            status: "failed",
          });
          return failedActivationResult;
        }
        throw new Error("expected provider write to reject");
      },
    }),
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: [
        '<file path="src/App.tsx">export default function App() { return null; }</file>',
        '<file path="src/Fail.tsx">export default function Fail() { return null; }</file>',
      ].join(""),
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 200);
  const events = await consumeSse(response);
  assert.deepEqual(writes, ["src/App.tsx", "src/Fail.tsx"]);
  assert.equal(calls.terminal, 1);
  assert.deepEqual(events.slice(-4).map((event) => event.type), [
    "validation-report",
    "rollback-started",
    "rollback-complete",
    "error",
  ]);
  assert.equal(events.some((event) => event.type === "complete"), false);
});

test("production apply route closes with rollback events when terminal persistence rejects", async () => {
  const { provider, writes } = createRouteProvider();
  const { persistence, calls } = createRoutePersistence({ rejectTerminalPersist: true });
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async () => provider as never,
    persistence,
    createActivation: ({ persistence: activationPersistence }) => ({
      activate: async (input) => {
        await input.applyCandidate();
        try {
          await activationPersistence.persistValidation({
            generationId: input.generation.id,
            report: failedReport,
            status: "failed",
          });
        } catch (error) {
          throw new LiveActivationPersistenceError(error, failedActivationResult);
        }
        throw new Error("expected terminal persistence to reject");
      },
    }),
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: candidate,
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 200);
  const events = await consumeSse(response);
  assert.deepEqual(writes, ["src/App.jsx"]);
  assert.equal(calls.terminal, 1);
  assert.deepEqual(events.slice(-4).map((event) => event.type), [
    "validation-report",
    "rollback-started",
    "rollback-complete",
    "error",
  ]);
  assert.equal(events.some((event) => event.type === "complete"), false);
});

test("production apply route closes safely when activation fails before candidate mutation starts", async () => {
  const { provider, writes } = createRouteProvider();
  const { persistence, calls } = createRoutePersistence();
  let snapshotCalls = 0;
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async () => provider as never,
    persistence,
    createSandboxService: () => ({
      snapshotFiles: async () => {
        snapshotCalls += 1;
        throw new Error("sandbox snapshot failed before candidate mutation");
      },
      restoreFiles: async () => undefined,
    }) as never,
    createActivation: ({ sandbox }) => createLiveValidationActivation({
      sandbox,
      orchestrator: {
        validate: async () => {
          throw new Error("validation must not run after snapshot failure");
        },
        repairAndRevalidate: async () => {
          throw new Error("repair must not run after snapshot failure");
        },
        persistFinal: async () => {
          throw new Error("terminal persistence must not run without a snapshot");
        },
      },
    }),
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: candidate,
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 200);
  const events = await consumeSseBeforeTimeout(response);
  assert.equal(snapshotCalls, 1);
  assert.deepEqual(writes, []);
  assert.equal(calls.terminal, 0);
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(events.some((event) => event.type === "validation-report"), false);
  assert.equal(events.some((event) => event.type.startsWith("rollback-")), false);
  assert.equal(events.some((event) => event.type === "complete"), false);
});

test("apply stream is activation-gated and only completes after a passed report", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/generation/live/apply-ai-code-stream-route.ts"), "utf8");
  const terminalSource = readFileSync(resolve(process.cwd(), "lib/generation/live/live-apply-terminal.ts"), "utf8");

  assert.match(source, /GenerationContextSchema\.safeParse/);
  assert.match(source, /createLiveValidationActivation/);
  assert.match(source, /type:\s*["']validation-started["']/);
  assert.match(source, /emitLiveActivationTerminalEvents/);
  assert.match(terminalSource, /type:\s*["']validation-report["']/);
  assert.match(terminalSource, /input\.result\.status\s*===\s*["']passed["']/);
  assert.match(source, /if \(!applicationPassed\) \{\s*return;/);
  assert.match(source, /type:\s*["']complete["']/);
});

test("live apply configures the one scoped repair path before activation", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/generation/live/apply-ai-code-stream-route.ts"), "utf8");

  assert.match(source, /repair:\s*\{\s*generatePatch:/s);
  assert.match(source, /applyPatch:\s*async/);
  assert.match(source, /input\.sandbox\.writeFiles/);
  assert.match(source, /providerInstance\.restartViteServer/);
});

test("route delegates provider writes to the rollback-aware live apply seam", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/generation/live/apply-ai-code-stream-route.ts"), "utf8");

  assert.match(source, /writeLiveCandidateFile/);
  assert.match(source, /await writeCandidate\(\{[\s\S]*provider: providerInstance/s);
  assert.match(source, /emitLiveActivationTerminalEvents/);
  assert.match(source, /candidateMutation\?\.fail\(error\);[\s\S]{0,220}await activationPromise/s);
});

test("route converts an activation persistence rejection into one safe terminal rollback sequence", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/generation/live/apply-ai-code-stream-route.ts"), "utf8");

  assert.match(source, /activationError instanceof LiveActivationPersistenceError/);
  assert.match(source, /emitTerminalEvents\(\{[\s\S]{0,260}activationError\.result/s);
  assert.match(source, /emittedTerminalFailure = true/);
});

test("generation stream emits candidate-ready instead of terminal complete", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/generate-ai-code-stream/route.ts"), "utf8");

  assert.match(source, /type:\s*["']candidate-ready["']/);
  assert.doesNotMatch(source, /type:\s*["']complete["']/);
});
