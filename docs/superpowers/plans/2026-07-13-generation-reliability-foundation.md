# Generation Reliability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace implicit process state with durable generation records, Redis coordination, and a reconnectable project-scoped sandbox service.

**Architecture:** PostgreSQL becomes the source of truth for generations and sandbox leases. Redis handles short-lived locks, progress, cancellation, and event delivery. API routes resolve sandboxes by explicit ID through `SandboxService`; compatibility code remains only until the builder migrates in Wave 5.

**Tech Stack:** TypeScript 5, PostgreSQL 16 via `pg`, Redis 7 via `redis` 6.1.0, Zod 3.25.76, Node test runner via `tsx` 4.23.1, E2B SDK 2.x, Next.js Route Handlers.

## Global Constraints

- Preserve `gstudio-agent-context` and all current uncommitted user changes.
- Use string-form project IDs at service boundaries even though the current `projects.id` column is integer.
- Use UUID generation IDs created with `crypto.randomUUID()`.
- Do not introduce any new process-global state.
- Do not remove legacy routes until Wave 5 consumer-count tests pass.
- Every database mutation is parameterized.
- Every lock has an expiry and an ownership token.

---

### Task 1: Establish the TypeScript Test Harness

**Files:**
- Modify: `package.json:6-13`
- Modify: `package-lock.json`
- Create: `tests/unit/test-harness.test.ts`

**Interfaces:**
- Consumes: Node 20+ and the existing CommonJS `node:test` suite.
- Produces: `npm run test:unit`, `npm run test:integration`, and `npm run test:all` scripts that execute `.test.ts` files through `tsx` without removing existing `.test.cjs` coverage.

- [ ] **Step 1: Write the failing harness test**

```ts
// tests/unit/test-harness.test.ts
import assert from "node:assert/strict";
import test from "node:test";

test("TypeScript node:test harness executes", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run the missing script and verify failure**

Run:

```powershell
npm run test:unit
```

Expected: FAIL with `Missing script: "test:unit"`.

- [ ] **Step 3: Install the runner and define deterministic scripts**

Run:

```powershell
npm install --save-dev tsx@4.23.1
```

Set the `package.json` scripts to:

```json
{
  "test:legacy": "node --test tests/*.test.cjs",
  "test:unit": "tsx --test tests/unit/**/*.test.ts",
  "test:integration": "tsx --test tests/integration/**/*.test.ts",
  "test:reference": "tsx --test tests/reference/**/*.test.ts",
  "test:validation": "tsx --test tests/validation/**/*.test.ts",
  "test:e2e": "playwright test",
  "test:all": "npm run test:legacy && npm run test:unit && npm run test:integration"
}
```

- [ ] **Step 4: Run the harness and legacy tests**

Run:

```powershell
npm run test:unit
npm run test:legacy
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tests/unit/test-harness.test.ts
git commit -m "test: add TypeScript test harness"
```

### Task 2: Define Generation Identity and State Schemas

**Files:**
- Create: `lib/generation/contracts/identity.ts`
- Create: `lib/generation/contracts/state.ts`
- Create: `tests/unit/generation-contracts.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `GenerationIdentitySchema`, `CreateGenerationSchema`, `GenerationStageSchema`, `GenerationStatusSchema`, and inferred TypeScript types used by repositories and routes.

- [ ] **Step 1: Write schema tests**

```ts
// tests/unit/generation-contracts.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateGenerationSchema,
  GenerationIdentitySchema,
} from "../../lib/generation/contracts/identity";

test("generation identity requires explicit project and generation IDs", () => {
  const parsed = GenerationIdentitySchema.parse({
    projectId: "42",
    generationId: "31d42e0a-a679-4b4e-a170-7a9f6a9edb95",
    sandboxId: null,
    userId: null,
  });
  assert.equal(parsed.projectId, "42");
});

test("generation creation rejects unsupported mode", () => {
  assert.throws(() =>
    CreateGenerationSchema.parse({ projectId: "42", mode: "seo" }),
  );
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx tsx --test tests/unit/generation-contracts.test.ts
```

Expected: FAIL because `lib/generation/contracts/identity.ts` does not exist.

- [ ] **Step 3: Implement the schemas**

```ts
// lib/generation/contracts/identity.ts
import { z } from "zod";

export const GenerationModeSchema = z.enum(["clone", "inspiration", "scratch", "edit"]);

export const GenerationIdentitySchema = z.object({
  projectId: z.string().min(1),
  generationId: z.string().uuid(),
  sandboxId: z.string().min(1).nullable(),
  userId: z.string().min(1).nullable(),
});

export const CreateGenerationSchema = z.object({
  projectId: z.string().min(1),
  mode: GenerationModeSchema,
  prompt: z.string().min(1),
  targetUrl: z.string().url().nullable().default(null),
  userId: z.string().min(1).nullable().default(null),
});

export type GenerationIdentity = z.infer<typeof GenerationIdentitySchema>;
export type CreateGenerationInput = z.infer<typeof CreateGenerationSchema>;
export type GenerationMode = z.infer<typeof GenerationModeSchema>;
```

```ts
// lib/generation/contracts/state.ts
import { z } from "zod";

export const GenerationStageSchema = z.enum([
  "created",
  "capturing",
  "planning",
  "generating",
  "applying",
  "validating",
  "repairing",
  "completed",
]);

export const GenerationStatusSchema = z.enum([
  "queued",
  "running",
  "passed",
  "failed",
  "cancelled",
]);

export type GenerationStage = z.infer<typeof GenerationStageSchema>;
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
```

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/generation-contracts.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/contracts tests/unit/generation-contracts.test.ts
git commit -m "feat: define generation identity contracts"
```

### Task 3: Persist Generations and Sandbox Leases

**Files:**
- Modify: `scripts/migrate-db.ts:20-56`
- Create: `lib/generation/repository.ts`
- Create: `lib/generation/event-repository.ts`
- Create: `lib/sandbox/lease-repository.ts`
- Create: `tests/integration/generation-repository.test.ts`

**Interfaces:**
- Consumes: `CreateGenerationInput`, `GenerationStage`, `GenerationStatus`, `query()` from `lib/db.ts`.
- Produces: `createGeneration`, `getGeneration`, `updateGenerationStage`, `saveGenerationPayload`, `appendGenerationEvent`, `listGenerationEvents`, `upsertSandboxLease`, `getSandboxLease`, and `markSandboxLeaseState`.

- [ ] **Step 1: Write the repository integration test**

```ts
// tests/integration/generation-repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { query } from "../../lib/db";
import { createGeneration, getGeneration, updateGenerationStage } from "../../lib/generation/repository";
import { appendGenerationEvent, listGenerationEvents } from "../../lib/generation/event-repository";

test("generation survives repository round trip", async () => {
  const project = await query(
    "INSERT INTO projects (name, target_url) VALUES ($1, $2) RETURNING id",
    ["generation-test", ""],
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
    await updateGenerationStage(generationId, "planning", "running");
    await appendGenerationEvent(generationId, { sequence: 2, type: "stage", payload: { stage: "planning" } });
    await appendGenerationEvent(generationId, { sequence: 1, type: "stage", payload: { stage: "created" } });
    const generation = await getGeneration(generationId);
    assert.equal(generation?.stage, "planning");
    assert.equal(generation?.status, "running");
    assert.deepEqual((await listGenerationEvents(generationId)).map((event) => event.sequence), [1, 2]);
  } finally {
    await query("DELETE FROM projects WHERE id = $1", [project.rows[0].id]);
  }
});
```

- [ ] **Step 2: Run migration and focused test to verify failure**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/integration/generation-repository.test.ts
```

Expected: FAIL because the `generations` table and repository do not exist.

- [ ] **Step 3: Add durable tables**

Append these idempotent statements inside `migrate()`:

```sql
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT,
  mode VARCHAR(20) NOT NULL,
  prompt TEXT NOT NULL,
  target_url TEXT,
  stage VARCHAR(30) NOT NULL DEFAULT 'created',
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  sandbox_id TEXT,
  brief_json JSONB,
  plan_json JSONB,
  artifact_json JSONB,
  validation_json JSONB,
  error_json JSONB,
  repair_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generations_project_created_idx
  ON generations(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_messages (
  id BIGSERIAL PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  parts_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_events (
  id BIGSERIAL PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  type VARCHAR(40) NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(generation_id, sequence)
);

CREATE TABLE IF NOT EXISTS sandbox_leases (
  sandbox_id TEXT PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  provider VARCHAR(20) NOT NULL,
  state VARCHAR(20) NOT NULL,
  url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
```

Implement repository functions with parameterized SQL and return camel-cased records. `saveGenerationPayload(id, column, value)` must accept only the literal columns `brief_json`, `plan_json`, `artifact_json`, `validation_json`, or `error_json`; reject every other column before composing SQL.

- [ ] **Step 4: Run migration, test, and TypeScript**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/integration/generation-repository.test.ts
npx tsc --noEmit
```

Expected: PASS; running migration twice remains successful.

- [ ] **Step 5: Commit**

```powershell
git add scripts/migrate-db.ts lib/generation/repository.ts lib/generation/event-repository.ts lib/sandbox/lease-repository.ts tests/integration/generation-repository.test.ts
git commit -m "feat: persist generation jobs and sandbox leases"
```

### Task 4: Add Redis Coordination with Ownership-Safe Locks

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docker-compose.yml:2-31`
- Modify: `.env.example`
- Create: `lib/redis/client.ts`
- Create: `lib/generation/coordination.ts`
- Create: `tests/integration/generation-coordination.test.ts`

**Interfaces:**
- Consumes: `REDIS_URL`.
- Produces: `getRedisClient()`, `acquireGenerationLock`, `releaseGenerationLock`, `publishGenerationEvent`, `subscribeGenerationEvents`, `requestGenerationCancellation`, and `isGenerationCancelled`.

- [ ] **Step 1: Write lock ownership tests**

```ts
// tests/integration/generation-coordination.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { acquireGenerationLock, releaseGenerationLock } from "../../lib/generation/coordination";

test("only the lock owner can release a generation lock", async () => {
  const id = `test-${Date.now()}`;
  const first = await acquireGenerationLock(id, 5_000);
  const second = await acquireGenerationLock(id, 5_000);
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(await releaseGenerationLock(id, "wrong-owner"), false);
  assert.equal(await releaseGenerationLock(id, first), true);
});
```

- [ ] **Step 2: Start Redis and verify failure**

Run:

```powershell
docker compose up -d redis
npx tsx --test tests/integration/generation-coordination.test.ts
```

Expected: FAIL because Redis configuration and coordination functions do not exist.

- [ ] **Step 3: Add Redis and coordination implementation**

Run:

```powershell
npm install redis@6.1.0
```

Add to `docker-compose.yml`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: gstudio-redis
    restart: unless-stopped
    ports:
      - "6380:6379"
```

Add `REDIS_URL=redis://localhost:6380` to `.env.example` and use `redis://redis:6379` in the web service environment. Port 6380 avoids the existing host-level Redis binding on 6379.

Implement the singleton client:

```ts
// lib/redis/client.ts
import { createClient } from "redis";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => console.error("[redis]", error));
  }
  if (!client.isOpen) await client.connect();
  return client;
}
```

Use `SET key token { PX: ttlMs, NX: true }` for acquisition. Release with a Lua compare-and-delete script so a stale owner cannot delete a renewed lock:

```ts
const RELEASE_LOCK = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;
```

Use a duplicated Redis connection for subscriptions; never subscribe on the command client.

- [ ] **Step 4: Run coordination tests**

Run:

```powershell
npx tsx --test tests/integration/generation-coordination.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json docker-compose.yml .env.example lib/redis lib/generation/coordination.ts tests/integration/generation-coordination.test.ts
git commit -m "feat: add generation coordination with Redis"
```

### Task 5: Introduce the Project-Scoped Sandbox Service

**Files:**
- Create: `lib/sandbox/service/contracts.ts`
- Create: `lib/sandbox/service/sandbox-service.ts`
- Create: `lib/sandbox/service/provider-registry.ts`
- Modify: `lib/sandbox/types.ts:1-49`
- Test: `tests/unit/sandbox-service.test.ts`

**Interfaces:**
- Consumes: `SandboxFactory`, sandbox lease repository, provider implementations.
- Produces: `SandboxService.allocate`, `connect`, `writeFiles`, `installPackages`, `startDevServer`, `waitUntilReady`, `runCommand`, `pause`, and `terminate`.

- [ ] **Step 1: Write a project-isolation test**

```ts
// tests/unit/sandbox-service.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxService } from "../../lib/sandbox/service/sandbox-service";

test("sandbox operations resolve the requested sandbox instead of an active singleton", async () => {
  const calls: string[] = [];
  const providers = {
    connect: async (id: string) => ({
      runCommand: async (command: string) => {
        calls.push(`${id}:${command}`);
        return { stdout: id, stderr: "", exitCode: 0, success: true };
      },
    }),
  };
  const service = createSandboxService({ providers: providers as never, leases: {} as never });
  await service.runCommand("sandbox-a", { command: "pwd" });
  await service.runCommand("sandbox-b", { command: "pwd" });
  assert.deepEqual(calls, ["sandbox-a:pwd", "sandbox-b:pwd"]);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
npx tsx --test tests/unit/sandbox-service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Define the service contract and implementation**

```ts
// lib/sandbox/service/contracts.ts
import type { CommandResult, SandboxFile, SandboxInfo } from "../types";

export interface CommandSpec { command: string; background?: boolean }
export interface ReadinessTarget { url: string; timeoutMs: number; intervalMs: number }
export interface ReadinessResult { ready: boolean; attempts: number; lastError: string | null }

export interface SandboxService {
  allocate(input: { projectId: string; generationId: string | null; provider: "e2b" | "vercel" }): Promise<SandboxInfo>;
  connect(sandboxId: string): Promise<SandboxInfo>;
  writeFiles(sandboxId: string, files: SandboxFile[]): Promise<void>;
  installPackages(sandboxId: string, packages: string[]): Promise<CommandResult>;
  startDevServer(sandboxId: string): Promise<void>;
  waitUntilReady(sandboxId: string, target: ReadinessTarget): Promise<ReadinessResult>;
  runCommand(sandboxId: string, spec: CommandSpec): Promise<CommandResult>;
  pause(sandboxId: string): Promise<void>;
  terminate(sandboxId: string): Promise<void>;
}
```

The implementation resolves every provider through `connect(sandboxId)` and updates `sandbox_leases.last_seen_at`. It does not expose `getActiveProvider()` or `setActiveSandbox()`.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/sandbox-service.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/sandbox/service lib/sandbox/types.ts tests/unit/sandbox-service.test.ts
git commit -m "feat: add project-scoped sandbox service"
```

### Task 6: Implement E2B Reconnect and Readiness Probes

**Files:**
- Modify: `lib/sandbox/providers/e2b-provider.ts:12-71, 516-571`
- Modify: `lib/sandbox/providers/vercel-provider.ts:518-584`
- Create: `lib/sandbox/templates/vite-react.ts`
- Create: `lib/sandbox/readiness/http-readiness.ts`
- Create: `tests/unit/e2b-provider.test.ts`
- Create: `tests/unit/http-readiness.test.ts`
- Create: `tests/unit/vite-template.test.ts`

**Interfaces:**
- Consumes: E2B `Sandbox.connect(sandboxId, { timeoutMs })`, provider command APIs.
- Produces: provider-level `connect`, `pause`, and background dev-server handling plus shared `waitForHttpReady`.

- [ ] **Step 1: Write reconnect and readiness tests**

```ts
// tests/unit/http-readiness.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { waitForHttpReady } from "../../lib/sandbox/readiness/http-readiness";

test("readiness returns the last observed error on timeout", async () => {
  const result = await waitForHttpReady({
    url: "http://127.0.0.1:1",
    timeoutMs: 25,
    intervalMs: 5,
    fetchImpl: async () => { throw new Error("connection refused"); },
  });
  assert.equal(result.ready, false);
  assert.match(result.lastError ?? "", /connection refused/);
});
```

Mock E2B's static `Sandbox.connect` and assert `reconnect("sandbox-1")` stores the returned sandbox and refreshes `sandboxInfo`. Add a template test asserting React 19.1.0, React DOM 19.1.0, Vite 7.3.6, `@vitejs/plugin-react` 5.2.0, and Tailwind CSS 3.4.19.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
npx tsx --test tests/unit/http-readiness.test.ts tests/unit/e2b-provider.test.ts tests/unit/vite-template.test.ts
```

Expected: FAIL because readiness and current reconnect behavior do not satisfy the contract.

- [ ] **Step 3: Replace reconnect and fixed sleeps**

Implement E2B reconnect using the SDK:

```ts
const connected = await Sandbox.connect(sandboxId, {
  timeoutMs: this.config.e2b?.timeoutMs,
});
this.sandbox = connected;
const info = await connected.getInfo();
this.sandboxInfo = {
  sandboxId,
  url: `https://${connected.getHost(appConfig.e2b.vitePort)}`,
  provider: "e2b",
  createdAt: new Date(info.startedAt),
};
```

Create E2B sandboxes with `lifecycle: { onTimeout: "pause", autoResume: true }`, implement `pause()`, and reconnect by durable ID. Pass complete command strings to the SDK command API; remove any `command.split(" ")` tokenization so quoted arguments remain intact.

Start Vite with the provider background-command API, retain its command handle, and call `waitForHttpReady` instead of sleeping for `viteStartupDelay`. Apply the same readiness helper to Vercel. Generate new sandbox package files from `vite-react.ts` so both providers use the same pinned template.

- [ ] **Step 4: Run tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/http-readiness.test.ts tests/unit/e2b-provider.test.ts tests/unit/vite-template.test.ts
npx tsc --noEmit
```

Expected: PASS and no fixed readiness sleep remains in the touched startup methods.

- [ ] **Step 5: Commit**

```powershell
git add lib/sandbox/providers lib/sandbox/readiness lib/sandbox/templates tests/unit/e2b-provider.test.ts tests/unit/http-readiness.test.ts tests/unit/vite-template.test.ts
git commit -m "fix: reconnect sandboxes and probe readiness"
```

### Task 7: Add Explicit-ID Sandbox and Generation Routes

**Files:**
- Create: `app/api/generations/route.ts`
- Create: `app/api/generations/[generationId]/route.ts`
- Create: `app/api/generations/[generationId]/events/route.ts`
- Modify: `app/api/create-ai-sandbox-v2/route.ts:15-103`
- Modify: `app/api/run-command-v2/route.ts:10-40`
- Modify: `app/api/install-packages-v2/route.ts:9-49`
- Modify: `app/api/sandbox-status/route.ts:10-42`
- Create: `tests/integration/generation-routes.test.ts`
- Create: `tests/integration/sandbox-routes.test.ts`

**Interfaces:**
- Consumes: generation repository, coordination service, `SandboxService`.
- Produces: `POST /api/generations`, `GET /api/generations/:id`, `GET /api/generations/:id/events`, and sandbox v2 routes that require `sandboxId` in path, query, or body.

- [ ] **Step 1: Write route contract tests**

```ts
test("run-command-v2 rejects a request without sandboxId", async () => {
  const response = await POST(new Request("http://localhost/api/run-command-v2", {
    method: "POST",
    body: JSON.stringify({ command: "pwd" }),
  }) as never);
  assert.equal(response.status, 400);
});
```

Add a generation creation test asserting the response contains UUID `generationId`, string `projectId`, `stage: "created"`, and `status: "queued"`.

- [ ] **Step 2: Run route tests and verify failure**

Run:

```powershell
npx tsx --test tests/integration/generation-routes.test.ts tests/integration/sandbox-routes.test.ts
```

Expected: FAIL because the generation routes do not exist and sandbox routes still use active provider fallback.

- [ ] **Step 3: Implement explicit-ID routes**

`POST /api/generations` parses `CreateGenerationSchema`, verifies the project exists, creates a UUID, persists the queued record, and returns `202`.

All sandbox v2 routes parse:

```ts
const SandboxRequestSchema = z.object({
  sandboxId: z.string().min(1),
});
```

Remove `sandboxManager.getActiveProvider() || global.activeSandboxProvider` from the touched v2 routes. Resolve through `sandboxService.connect(sandboxId)` or the requested operation directly.

The events route streams `generation_events` after the optional `after` sequence, then subscribes to Redis Pub/Sub for new events, and closes on `passed`, `failed`, or `cancelled`.

- [ ] **Step 4: Run the wave verification**

Run:

```powershell
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/api/generations app/api/create-ai-sandbox-v2 app/api/run-command-v2 app/api/install-packages-v2 app/api/sandbox-status tests/integration
git commit -m "feat: add explicit generation and sandbox routes"
```

## Wave 1 Completion Check

Run:

```powershell
rg -n "getActiveProvider\(\)|global\.activeSandboxProvider" app/api/create-ai-sandbox-v2 app/api/run-command-v2 app/api/install-packages-v2 app/api/sandbox-status
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: the search returns no matches in migrated v2 routes; all verification commands pass. Legacy routes may still contain globals until Wave 5.
