# Builder Integration and Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate durable staged generation into the builder, prove isolation and quality through E2E benchmarks, then remove legacy routes and process globals.

**Architecture:** Extract API, state, and effect boundaries from the existing 5,000-line builder without redesigning its approved UI. The builder creates a generation, subscribes to durable events, restores state after reload, and renders persisted artifacts/reports. Legacy endpoints are removed only after static consumer tests and E2E flows show zero usage.

**Tech Stack:** React 19, Next.js 15 App Router, TypeScript, existing builder CSS, Server-Sent Events, Playwright 1.61.1, PostgreSQL metrics.

## Global Constraints

- Preserve the current Lovable-oriented builder styling and canonical-context work.
- Do not add SEO/review/publish panels before a generated project exists and passes required gates.
- Keep project, generation, sandbox, and message state explicitly scoped.
- Reloading the page must restore the current generation timeline from PostgreSQL before listening for new Redis events.
- Do not remove a legacy route while any source file still calls it.
- Final cleanup must leave no runtime `global.activeSandbox`, `global.activeSandboxProvider`, `global.sandboxState`, or `global.conversationState` references.

---

### Task 1: Add the Typed Builder API Client and Reducer

**Files:**
- Create: `features/builder/api/contracts.ts`
- Create: `features/builder/api/client.ts`
- Create: `features/builder/state/builder-state.ts`
- Create: `features/builder/state/builder-reducer.ts`
- Create: `tests/unit/builder-reducer.test.ts`
- Create: `tests/unit/builder-api-client.test.ts`

**Interfaces:**
- Consumes: generation, sandbox, artifact, and validation route contracts.
- Produces: `BuilderState`, `BuilderAction`, `builderReducer`, and `builderApi` methods.

- [ ] **Step 1: Write project-switch and reload reducer tests**

```ts
test("project switch clears generation-specific state", () => {
  const next = builderReducer(populatedBuilderState, {
    type: "project/selected",
    projectId: "22",
  });
  assert.equal(next.projectId, "22");
  assert.equal(next.generationId, null);
  assert.equal(next.sandboxId, null);
  assert.deepEqual(next.timeline, []);
});

test("generation snapshot replaces stale event state", () => {
  const next = builderReducer(populatedBuilderState, {
    type: "generation/snapshot",
    snapshot: generationSnapshotFixture,
  });
  assert.equal(next.stage, generationSnapshotFixture.stage);
  assert.equal(next.status, generationSnapshotFixture.status);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/builder-reducer.test.ts tests/unit/builder-api-client.test.ts
```

Expected: FAIL because builder modules do not exist.

- [ ] **Step 3: Implement typed state and client**

```ts
export interface BuilderState {
  projectId: string | null;
  generationId: string | null;
  sandboxId: string | null;
  mode: "clone" | "inspiration" | "scratch" | "edit";
  stage: GenerationStage | null;
  status: GenerationStatus | null;
  timeline: GenerationEvent[];
  artifact: GenerationArtifact | null;
  validation: ValidationReport | null;
  error: { code: string; message: string } | null;
}
```

`builderApi` methods:

```ts
createGeneration(input): Promise<GenerationSnapshot>
runGeneration(generationId): Promise<{ eventsUrl: string }>
getGeneration(generationId): Promise<GenerationSnapshot>
getArtifact(generationId): Promise<GenerationArtifact | null>
connectEvents(generationId, handlers): () => void
allocateSandbox(input): Promise<SandboxLease>
```

Every response passes its Zod schema. A non-JSON or schema-invalid response becomes `BuilderApiError` with endpoint and status but no response secrets.

- [ ] **Step 4: Run unit tests**

Run:

```powershell
npx tsx --test tests/unit/builder-reducer.test.ts tests/unit/builder-api-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add features/builder/api features/builder/state tests/unit/builder-reducer.test.ts tests/unit/builder-api-client.test.ts
git commit -m "feat: add typed builder generation state"
```

### Task 2: Extract Generation Lifecycle Hooks

**Files:**
- Create: `features/builder/hooks/use-generation.ts`
- Create: `features/builder/hooks/use-generation-events.ts`
- Create: `features/builder/hooks/use-project-session.ts`
- Modify: `app/generation/page.tsx:197-377, 646-895, 2116-2565, 3025-3535`
- Create: `tests/unit/use-generation-events.test.ts`

**Interfaces:**
- Consumes: `builderApi`, reducer dispatch, explicit project/sandbox IDs.
- Produces: `useGeneration`, `useGenerationEvents`, and `useProjectSession`.

- [ ] **Step 1: Write event deduplication and restore tests**

```ts
test("event hook ignores an event already present in the restored snapshot", () => {
  const state = reduceEvents([eventFixture({ sequence: 4 })], eventFixture({ sequence: 4 }));
  assert.equal(state.length, 1);
});

test("events reconnect starts after persisted sequence", () => {
  assert.equal(buildEventsUrl("generation-1", 7), "/api/generations/generation-1/events?after=7");
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/use-generation-events.test.ts
```

Expected: FAIL because lifecycle hooks do not exist.

- [ ] **Step 3: Extract lifecycle behavior**

`useGeneration.start()` performs:

1. Validate current project.
2. Allocate/connect sandbox with project ID.
3. Create generation with selected mode and prompt.
4. Dispatch snapshot.
5. Connect event stream.
6. Trigger run endpoint.

On mount with a generation ID, fetch the persisted snapshot first, dispatch it, then connect SSE after the last persisted sequence. On project change, close the old event source before clearing state.

Move only orchestration/state effects from the page. Leave presentation markup and approved CSS in place.

- [ ] **Step 4: Run tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/use-generation-events.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add features/builder/hooks app/generation/page.tsx tests/unit/use-generation-events.test.ts
git commit -m "refactor: extract builder generation lifecycle"
```

### Task 3: Add Durable Messages and Generation Timeline UI

**Files:**
- Create: `app/api/generations/[generationId]/messages/route.ts`
- Create: `lib/generation/message-repository.ts`
- Create: `features/builder/ui/generation-timeline.tsx`
- Create: `features/builder/ui/generation-status.tsx`
- Create: `features/builder/ui/validation-summary.tsx`
- Modify: `app/generation/page.tsx:3500-4300`
- Create: `tests/integration/generation-messages.test.ts`
- Create: `tests/unit/generation-timeline.test.ts`

**Interfaces:**
- Consumes: `generation_messages`, persisted stage events, validation report.
- Produces: scoped message API and timeline components.

- [ ] **Step 1: Write message isolation and visibility tests**

```ts
test("messages are scoped to generation ID", async () => {
  await appendGenerationMessage("generation-a", { role: "user", content: "A", parts: null });
  await appendGenerationMessage("generation-b", { role: "user", content: "B", parts: null });
  assert.deepEqual((await listGenerationMessages("generation-a")).map((item) => item.content), ["A"]);
});

test("review controls stay hidden before a passing validation report", () => {
  const model = buildTimelineViewModel({ status: "running", validation: null });
  assert.equal(model.showReviewActions, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/generation-messages.test.ts tests/unit/generation-timeline.test.ts
```

Expected: FAIL because repositories and timeline components do not exist.

- [ ] **Step 3: Implement scoped messages and timeline**

The message route lists/appends messages only after verifying the generation belongs to the requested project context. Store multimodal parts as JSON metadata and plain user-visible content separately.

Timeline states:

```text
Reference capture -> Design plan -> Code generation -> Sandbox apply -> Validation -> Repair (optional) -> Complete
```

Display provider warnings and reduced-fidelity notices without exposing internal stack traces. Show review, export, and publish actions only after artifact existence; visually distinguish hard-gate failure from infrastructure failure.

- [ ] **Step 4: Run tests**

Run:

```powershell
npx tsx --test tests/integration/generation-messages.test.ts tests/unit/generation-timeline.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/api/generations lib/generation/message-repository.ts features/builder/ui app/generation/page.tsx tests/integration/generation-messages.test.ts tests/unit/generation-timeline.test.ts
git commit -m "feat: show durable generation timeline"
```

### Task 4: Expose Manual and Scheduled Adaptive Re-Sync

**Files:**
- Modify: `scripts/migrate-db.ts`
- Create: `lib/reference/sync-repository.ts`
- Create: `lib/reference/sync-runner.ts`
- Create: `app/api/projects/[id]/reference-sync/route.ts`
- Create: `scripts/run-reference-sync.ts`
- Create: `features/builder/ui/reference-sync-control.tsx`
- Modify: `features/builder/api/client.ts`
- Modify: `app/generation/page.tsx`
- Create: `tests/integration/reference-sync.test.ts`
- Create: `tests/unit/reference-sync-control.test.ts`

**Interfaces:**
- Consumes: latest project reference, Scrapling adaptive snapshots, capture router.
- Produces: manual refresh, optional interval configuration, and a single-run scheduler command.

- [ ] **Step 1: Write due-job and manual-refresh tests**

```ts
test("sync repository returns only enabled due projects", async () => {
  await saveReferenceSyncConfig({ projectId, enabled: true, intervalMinutes: 60, nextRunAt: new Date(0) });
  const due = await claimDueReferenceSyncs({ now: new Date(), limit: 10 });
  assert.deepEqual(due.map((item) => item.projectId), [String(projectId)]);
});

test("manual sync uses resync capture purpose", async () => {
  const calls: string[] = [];
  await runReferenceSync({ projectId: String(projectId), capture: async (request) => { calls.push(request.purpose); return referenceResultFixture; } });
  assert.deepEqual(calls, ["resync"]);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/reference-sync.test.ts tests/unit/reference-sync-control.test.ts
```

Expected: FAIL because sync storage, runner, route, and control do not exist.

- [ ] **Step 3: Implement bounded re-sync**

Add:

```sql
CREATE TABLE IF NOT EXISTS reference_sync_configs (
  project_id INT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  interval_minutes INT NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 60 AND 10080),
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The route supports:

- `GET`: return current configuration and latest capture confidence.
- `POST { action: "run" }`: trigger one project-scoped re-sync.
- `PUT { enabled, intervalMinutes }`: update the bounded 60-minute to 7-day interval.

`run-reference-sync.ts` claims due rows with `FOR UPDATE SKIP LOCKED`, processes a configurable maximum, and exits. Deployment invokes it from an external cron; it is not an infinite loop inside the Next.js web process.

The builder control shows last run, confidence change, and manual refresh. It does not display or request stored authentication state.

- [ ] **Step 4: Run tests and one scheduler dry run**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/integration/reference-sync.test.ts tests/unit/reference-sync-control.test.ts
npx tsx scripts/run-reference-sync.ts --limit 1 --dry-run
```

Expected: tests PASS and dry run lists due project IDs without starting capture.

- [ ] **Step 5: Commit**

```powershell
git add scripts/migrate-db.ts scripts/run-reference-sync.ts lib/reference app/api/projects features/builder app/generation/page.tsx tests/integration/reference-sync.test.ts tests/unit/reference-sync-control.test.ts
git commit -m "feat: add adaptive reference re-sync"
```

### Task 5: Migrate Builder Operations to Explicit-ID APIs

**Files:**
- Modify: `app/generation/page.tsx:556-1420, 2116-3535`
- Modify: `features/builder/api/client.ts`
- Delete only after consumer migration: calls to `/api/install-packages`, `/api/conversation-state`, `/api/get-sandbox-files`, `/api/write-sandbox-files` without sandbox ID, and `/api/generate-ai-code-stream`.
- Create: `tests/unit/builder-api-consumers.test.ts`

**Interfaces:**
- Consumes: new generation and sandbox endpoints.
- Produces: zero builder consumers of legacy stateful APIs.

- [ ] **Step 1: Write a source-consumer guard test**

```ts
test("builder does not call legacy stateful endpoints", () => {
  const source = readFileSync(resolve("app/generation/page.tsx"), "utf8");
  for (const endpoint of [
    "/api/generate-ai-code-stream",
    "/api/conversation-state",
    "/api/install-packages",
  ]) {
    assert.equal(source.includes(endpoint), false, endpoint);
  }
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/builder-api-consumers.test.ts
```

Expected: FAIL and list current legacy endpoints.

- [ ] **Step 3: Replace builder calls**

Replace legacy generation with `createGeneration` and `runGeneration`. Replace package, file, status, and command calls with v2 routes carrying `sandboxId`. Replace conversation-state calls with generation messages.

Remove timeout-based iframe refreshes triggered by guessed package/build completion. Refresh only after persisted `applying` completion and readiness success events.

Keep session storage only as a navigation convenience for `projectId`, `generationId`, and `sandboxId`; server state remains authoritative.

- [ ] **Step 4: Run source guard and UI tests**

Run:

```powershell
npx tsx --test tests/unit/builder-api-consumers.test.ts
node --test tests/generation-builder-ui.test.cjs tests/generation-intent-ui.test.cjs
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/generation/page.tsx features/builder/api/client.ts tests/unit/builder-api-consumers.test.ts
git commit -m "refactor: migrate builder to durable generation APIs"
```

### Task 6: Add Builder E2E Isolation and Recovery Flows

**Files:**
- Create: `tests/e2e/builder-generation.spec.ts`
- Create: `tests/e2e/builder-project-isolation.spec.ts`
- Create: `tests/e2e/builder-reload.spec.ts`
- Create: `tests/e2e/api-fixtures.ts`

**Interfaces:**
- Consumes: builder UI and deterministic mocked provider routes in test mode.
- Produces: clone, inspiration, scratch, edit, reload, restore, and project-switch release tests.

- [ ] **Step 1: Write the project-isolation E2E test**

```ts
test("switching projects does not reuse generation or sandbox state", async ({ page }) => {
  await seedProject(page, { name: "Project A", sandboxId: "sandbox-a", generationId: "generation-a" });
  await seedProject(page, { name: "Project B", sandboxId: "sandbox-b", generationId: "generation-b" });
  await page.goto("/generation?project=1");
  await expect(page.getByTestId("sandbox-id")).toHaveText("sandbox-a");
  await selectProject(page, "Project B");
  await expect(page.getByTestId("sandbox-id")).toHaveText("sandbox-b");
  await expect(page.getByTestId("generation-id")).toHaveText("generation-b");
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run test:e2e -- builder-project-isolation.spec.ts
```

Expected: FAIL before data-test IDs and durable restore are wired.

- [ ] **Step 3: Complete E2E fixtures and selectors**

Add stable `data-testid` attributes to project, generation, sandbox, timeline, preview, and validation elements. Mock external providers but retain real PostgreSQL, Redis, route handlers, reducers, and SSE flow.

Tests cover:

- Scratch generation to passing preview.
- Clone generation with two screenshot image parts.
- Inspiration generation without clone-fidelity skill.
- Edit generation using existing project files.
- Reload during `generating` and resume timeline.
- Failed apply retaining previous version.
- Project A/B switching with isolated messages and sandbox IDs.

- [ ] **Step 4: Run E2E suite**

Run:

```powershell
npm run test:e2e -- builder-generation.spec.ts builder-project-isolation.spec.ts builder-reload.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e app/generation/page.tsx features/builder
git commit -m "test: cover builder generation recovery and isolation"
```

### Task 7: Build the Benchmark and Metrics Runner

**Files:**
- Create: `lib/generation/metrics-query.ts`
- Create: `scripts/run-generation-benchmark.ts`
- Create: `tests/benchmarks/manifest.ts`
- Create: `tests/benchmarks/manifest.test.ts`
- Create: `tests/benchmarks/report-schema.ts`
- Create: `tests/integration/generation-metrics.test.ts`

**Interfaces:**
- Consumes: persisted generations, events, capture decisions, and validation reports.
- Produces: aggregate metrics and a 30-case JSON benchmark report.

- [ ] **Step 1: Write metrics and manifest tests**

```ts
test("metrics separate first-pass and repaired passes", () => {
  const summary = summarizeGenerationMetrics([
    metricFixture({ finalStatus: "passed", repairCount: 0 }),
    metricFixture({ finalStatus: "passed", repairCount: 1 }),
    metricFixture({ finalStatus: "failed", repairCount: 1 }),
  ]);
  assert.equal(summary.firstPassRate, 1 / 3);
  assert.equal(summary.repairToPassRate, 1 / 2);
});

test("benchmark manifest contains ten cases per mode", () => {
  assert.equal(manifest.filter((item) => item.mode === "clone").length, 10);
  assert.equal(manifest.filter((item) => item.mode === "inspiration").length, 10);
  assert.equal(manifest.filter((item) => item.mode === "scratch").length, 10);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/generation-metrics.test.ts tests/benchmarks/manifest.test.ts
```

Expected: FAIL because metrics query and manifest do not exist.

- [ ] **Step 3: Add metrics aggregation and exact benchmark cases**

`metrics-query.ts` joins generations, reference captures, and ordered events, then returns first-pass compile rate, deterministic gate rate, repair-to-pass rate, median stage latency, provider fallback counts, capture confidence, accessibility pass rate, and per-axis clone fidelity.

The manifest contains:

- Clone: editorial-newsroom, SaaS-workbench, ecommerce-grid, luxury-portfolio, corporate-investor, technical-docs, travel-marketplace, restaurant-editorial, nonprofit-campaign, product-launch.
- Inspiration: the same ten product categories with wholly original macrostructure requirements.
- Scratch: accounting SaaS, legal-tech, sustainable furniture shop, architecture portfolio, local restaurant, AI developer tool, healthcare booking, nonprofit campaign, financial newsroom, B2B logistics platform.

Each case has fixed prompt, viewport, supplied facts, prohibited claims, expected mode, required checks, and local reference fixture IDs. Live URL refresh is a separate opt-in command and never normal CI.

The runner records first-pass compile, gate pass, repair result, capture provider/engine, latency, confidence, visual axes, accessibility, and final status.

- [ ] **Step 4: Run event tests and a smoke benchmark**

Run:

```powershell
npx tsx --test tests/integration/generation-metrics.test.ts tests/benchmarks/manifest.test.ts
npx tsx scripts/run-generation-benchmark.ts --case scratch-accounting-saas
```

Expected: tests PASS and one JSON report is written under `test-results/benchmarks/`.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/metrics-query.ts scripts/run-generation-benchmark.ts tests/benchmarks tests/integration/generation-metrics.test.ts
git commit -m "test: add generation benchmark and metrics runner"
```

### Task 8: Remove Legacy Routes and Process Globals

**Files:**
- Delete after zero-consumer proof: `app/api/conversation-state/route.ts`
- Delete after zero-consumer proof: `app/api/create-ai-sandbox/route.ts`
- Delete after zero-consumer proof: `app/api/apply-ai-code/route.ts`
- Delete after zero-consumer proof: `app/api/generate-ai-code-stream/route.ts`
- Delete after zero-consumer proof: legacy `app/api/run-command`, `install-packages`, `get-sandbox-files`, and global-only log routes.
- Modify: `app/api/apply-ai-code-stream/route.ts`
- Modify: `lib/sandbox/sandbox-manager.ts`
- Modify: `package.json`
- Create: `tests/unit/no-process-global-state.test.ts`
- Create: `tests/unit/no-legacy-api-consumers.test.ts`

**Interfaces:**
- Consumes: completed builder migration and new routes.
- Produces: zero runtime global state and zero legacy API consumers.

- [ ] **Step 1: Write deletion guard tests**

```ts
test("runtime code contains no implicit sandbox or conversation globals", () => {
  const matches = searchRuntime(/global\.(activeSandbox|activeSandboxProvider|sandboxState|conversationState)/g);
  assert.deepEqual(matches, []);
});

test("runtime code contains no legacy endpoint consumers", () => {
  const matches = searchRuntime(/\/api\/(conversation-state|generate-ai-code-stream|create-ai-sandbox)(?:["'`/?])/g);
  assert.deepEqual(matches, []);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/no-process-global-state.test.ts tests/unit/no-legacy-api-consumers.test.ts
```

Expected: FAIL and enumerate remaining files.

- [ ] **Step 3: Remove consumers, compatibility branches, and routes**

Delete a route only after its consumer list is empty. Remove `activeSandboxId` behavior and the global singleton assignment from `sandbox-manager.ts`; retain only provider construction helpers used by `SandboxService`.

Remove regex XML parsing after the structured apply path is the sole consumer. Keep a database migration and project-version compatibility path; do not delete historical project data.

Set scripts to:

```json
{
  "test:all": "npm run test:legacy && npm run test:unit && npm run test:integration && npm run test:reference && npm run test:validation",
  "test:release": "npm run test:all && npm run test:e2e && npm run build"
}
```

Keep browser E2E outside `test:all` because it owns a web server lifecycle; `test:release` is the full release command.

- [ ] **Step 4: Run complete release verification**

Run:

```powershell
npm run test:all
npm run test:reference
npm run test:validation
npm run test:e2e
npx tsc --noEmit
npm run build
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```powershell
git add -A app/api lib/sandbox types tests/unit package.json
git commit -m "chore: remove legacy generation state"
```

## Wave 5 Completion Check

Run:

```powershell
rg -n "global\.(activeSandbox|activeSandboxProvider|sandboxState|conversationState)" app lib
rg -n "/api/(conversation-state|generate-ai-code-stream|create-ai-sandbox)" app features lib
npm run test:all
npm run build
```

Expected: both searches return no runtime matches; tests and production build pass.
