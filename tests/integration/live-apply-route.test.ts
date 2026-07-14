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

test("production apply rejects an invalid requested package before any provider or persistence side effect", async () => {
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
      throw new Error("live activation must not start for an invalid package");
    },
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: candidate,
      packages: ["lucide-react; rm -rf /"],
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.equal(activationCalls, 0);
  assert.deepEqual(calls, { resolve: 0, prepare: 0, terminal: 0, repair: 0 });
});

test("production apply rejects an invalid generated package before any provider or persistence side effect", async () => {
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
      throw new Error("live activation must not start for an invalid generated package");
    },
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: `${candidate}<package>lucide-react; rm -rf /</package>`,
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.equal(activationCalls, 0);
  assert.deepEqual(calls, { resolve: 0, prepare: 0, terminal: 0, repair: 0 });
});

test("production apply rejects an invalid dynamic import before any provider or persistence side effect", async () => {
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
      throw new Error("live activation must not start for an invalid dynamic import");
    },
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: '<file path="src/App.jsx">export async function load() { return import("lucide-react; rm -rf /"); }</file>',
      sandboxId: "sandbox-route-test",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.equal(activationCalls, 0);
  assert.deepEqual(calls, { resolve: 0, prepare: 0, terminal: 0, repair: 0 });
});

test("production apply restores dependency manifests and uninstalls on the resolved provider after validation fails", async () => {
  const files = new Map<string, string>([
    ["package.json", JSON.stringify({ dependencies: { react: "^18.0.0" } })],
    ["package-lock.json", "lock-before"],
    ["src/App.jsx", "before"],
  ]);
  const installCalls: string[][] = [];
  const commands: string[] = [];
  const writes: string[] = [];
  const installedNodes = new Set<string>();
  const provider = {
    getSandboxInfo: () => ({
      sandboxId: "sandbox-dependency-rollback",
      url: "https://sandbox.example.test",
      provider: "e2b" as const,
      createdAt: new Date(),
    }),
    readFile: async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error("ENOENT");
      return content;
    },
    writeFile: async (path: string, content: string) => {
      writes.push(path);
      files.set(path, content);
    },
    runCommand: async (command: string) => {
      commands.push(command);
      if (command === "npm uninstall --no-save -- lucide-react") {
        installedNodes.delete("lucide-react");
      }
      return { stdout: "", stderr: "", exitCode: 0, success: true };
    },
    installPackages: async (packages: string[]) => {
      installCalls.push([...packages]);
      files.set("package.json", JSON.stringify({ dependencies: {
        react: "^18.0.0",
        "lucide-react": "^1.0.0",
      } }));
      files.set("package-lock.json", "lock-after");
      installedNodes.add("lucide-react");
      return { stdout: "installed", stderr: "", exitCode: 0, success: true };
    },
    restartViteServer: async () => undefined,
  };
  const { persistence, calls } = createRoutePersistence();
  const persistValidation = persistence.persistValidation;
  persistence.persistValidation = async (input) => {
    assert.equal(files.get("package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    assert.equal(files.get("package-lock.json"), "lock-before");
    assert.equal(installedNodes.has("lucide-react"), false);
    await persistValidation(input);
  };
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async () => provider as never,
    persistence,
    createSandboxService: () => ({
      snapshotFiles: async (_sandboxId: string, paths: string[]) => paths.map((path) => ({
        path,
        content: files.get(path) ?? null,
      })),
      restoreFiles: async (_sandboxId: string, snapshots: Array<{ path: string; content: string | null }>) => {
        for (const snapshot of snapshots) {
          if (snapshot.content === null) files.delete(snapshot.path);
          else files.set(snapshot.path, snapshot.content);
        }
      },
    }) as never,
    createActivation: ({ sandbox, persistence: activationPersistence }) => createLiveValidationActivation({
      sandbox,
      orchestrator: {
        validate: async () => failedReport,
        repairAndRevalidate: async () => failedReport,
        persistFinal: async (entry) => activationPersistence.persistValidation({
          generationId: entry.generationId,
          report: entry.report,
          status: entry.status,
        }),
      },
    }),
  });

  const response = await applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      response: '<file path="src/App.jsx">export async function loadIcon() { return import("lucide-react"); }</file>',
      sandboxId: "sandbox-dependency-rollback",
      generationContext: validGenerationContext,
    }),
  }) as never);

  assert.equal(response.status, 200);
  const events = await consumeSse(response);
  assert.deepEqual(installCalls, [["lucide-react"]]);
  assert.ok(commands.some((command) => command === "npm uninstall --no-save -- lucide-react"));
  assert.equal(installedNodes.has("lucide-react"), false);
  assert.equal(files.get("package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
  assert.equal(files.get("package-lock.json"), "lock-before");
  assert.equal(files.get("src/App.jsx"), "before");
  assert.equal(calls.terminal, 1);
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(events.some((event) => event.type === "complete"), false);
  assert.ok(writes.includes("src/App.jsx"));
});

test("production apply keeps concurrent sandbox cache state isolated", async () => {
  const writesBySandbox = new Map<string, string[]>();
  const providerFor = (sandboxId: string) => ({
    getSandboxInfo: () => ({
      sandboxId,
      url: `https://${sandboxId}.example.test`,
      provider: "e2b" as const,
      createdAt: new Date(),
    }),
    writeFile: async (path: string) => {
      const writes = writesBySandbox.get(sandboxId) ?? [];
      writes.push(path);
      writesBySandbox.set(sandboxId, writes);
    },
    runCommand: async () => ({ stdout: "", stderr: "", exitCode: 0, success: true }),
    installPackages: async () => ({ stdout: "", stderr: "", exitCode: 0, success: true }),
    restartViteServer: async () => undefined,
  });
  const providers = new Map([
    ["sandbox-isolated-a", providerFor("sandbox-isolated-a")],
    ["sandbox-isolated-b", providerFor("sandbox-isolated-b")],
  ]);
  const { persistence } = createRoutePersistence();
  const applyRoute = createApplyAiCodeStreamRoute({
    resolveProvider: async ({ sandboxId }) => providers.get(sandboxId!) as never,
    persistence,
    createActivation: () => ({
      activate: async (input) => {
        await input.applyCandidate();
        return {
          status: "passed" as const,
          report: {
            static: [],
            responsive: [],
            repairEligibility: { eligible: false, reason: "passed" },
            finalStatus: "passed" as const,
          },
          rolledBack: false,
        };
      },
    }) as never,
  });
  const runtime = globalThis as typeof globalThis & {
    existingFiles?: Set<string>;
    sandboxState?: { fileCache?: { files: Record<string, unknown> } };
  };
  const originalExistingFiles = runtime.existingFiles;
  const originalSandboxState = runtime.sandboxState;
  runtime.existingFiles = new Set(["src/App.jsx"]);
  runtime.sandboxState = { fileCache: { files: { "src/App.jsx": { content: "foreign" } } } };

  try {
    const requests = ["sandbox-isolated-a", "sandbox-isolated-b"].map((sandboxId, index) => (
      applyRoute(new Request("http://localhost/api/apply-ai-code-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          response: `<file path="src/App.jsx">export default function App() { return <main>${index}</main>; }</file>`,
          sandboxId,
          generationContext: { ...validGenerationContext, generationId: `00000000-0000-4000-8000-00000000001${index}` },
        }),
      }) as never)
    ));
    const responses = await Promise.all(requests);
    const events = await Promise.all(responses.map(consumeSse));

    assert.deepEqual(writesBySandbox.get("sandbox-isolated-a"), ["src/App.jsx"]);
    assert.deepEqual(writesBySandbox.get("sandbox-isolated-b"), ["src/App.jsx"]);
    assert.deepEqual(events.map((stream) => stream.at(-1)?.type), ["complete", "complete"]);
    assert.deepEqual(events.map((stream) => (stream.at(-1)?.results as { filesCreated: string[] }).filesCreated), [
      ["src/App.jsx"],
      ["src/App.jsx"],
    ]);
    assert.deepEqual(runtime.existingFiles, new Set(["src/App.jsx"]));
    assert.deepEqual(runtime.sandboxState, { fileCache: { files: { "src/App.jsx": { content: "foreign" } } } });
  } finally {
    if (originalExistingFiles === undefined) delete runtime.existingFiles;
    else runtime.existingFiles = originalExistingFiles;
    if (originalSandboxState === undefined) delete runtime.sandboxState;
    else runtime.sandboxState = originalSandboxState;
  }
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
