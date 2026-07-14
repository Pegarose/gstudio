# Live Generation Validation Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the builder report generation success only after the applied sandbox passes deterministic validation, optional single scoped repair, and safe rollback handling; use strict screenshot snapshots outside explicit masks.

**Architecture:** The existing TR4 stream remains a candidate generator and LLM QA layer. A new live activation boundary snapshots the sandbox, applies the candidate through an injected callback, evaluates the existing validation runner, performs at most one existing scoped repair, rolls back terminal failures, and persists exactly one final report. The legacy apply SSE route adapts this boundary; the client treats that route's completion as the only terminal success.

**Tech Stack:** Next.js 15 App Router SSE routes, TypeScript, Zod 3, PostgreSQL generation records, SandboxService, Playwright 1.61.

## Global Constraints

- Existing TR4 LLM QA remains enabled; deterministic validation is an additional authority.
- Static, dependency, build, runtime, responsive, keyboard, reduced-motion, and accessibility failures are hard gates.
- Only `static-rule`, `dependency`, `compile`, `runtime`, `responsive`, `accessibility`, and `visual-fidelity` can enter one repair attempt.
- Policy, provider, secret, sandbox-infrastructure, user-input, and missing-reference failures never invoke repair.
- Clone fails closed with a persisted reference-evidence error until durable desktop/mobile reference capture is wired. Inspiration uses the same hard gates when a durable brand-language bundle is supplied; it fails closed with that error only when the bundle is absent.
- A failed candidate or failed repair must restore the affected sandbox files before the route emits its terminal error.
- `complete` means `finalStatus: "passed"`; no earlier candidate event may be treated as a product success.
- Screenshot assertions use `maxDiffPixelRatio: 0`; only explicit dynamic selectors may be masked.
- Do not use global active sandbox state in new validation/rollback code.

---

### Task 1: Add sandbox file snapshot and restore primitives

**Files:**
- Modify: `lib/sandbox/service/contracts.ts`
- Modify: `lib/sandbox/service/sandbox-service.ts`
- Create: `tests/unit/sandbox-validation-snapshot.test.ts`

**Interfaces:**
- Produces `SandboxFileSnapshot`, `snapshotFiles(sandboxId, paths)`, and `restoreFiles(sandboxId, snapshots)` on `SandboxService`.
- Consumes only safe `src/**` and `public/**` generated paths plus `index.html`.

- [x] **Step 1: Write failing snapshot tests**

```ts
test("snapshot and restore rewrite an existing file and remove a newly created file", async () => {
  const service = createSandboxService({ providers: fakeRegistry({
    files: { "src/App.tsx": "before" },
  }) });

  const snapshot = await service.snapshotFiles("sandbox-1", ["src/App.tsx", "src/New.tsx"]);
  await service.writeFiles("sandbox-1", [
    { path: "src/App.tsx", content: "after" },
    { path: "src/New.tsx", content: "new" },
  ]);
  await service.restoreFiles("sandbox-1", snapshot);

  assert.equal(fakeProvider.files.get("src/App.tsx"), "before");
  assert.equal(fakeProvider.files.has("src/New.tsx"), false);
});

test("snapshot rejects a shell-unsafe or out-of-scope path", async () => {
  await assert.rejects(
    () => service.snapshotFiles("sandbox-1", ["src/App.tsx; rm -rf /"]),
    /unsafe sandbox snapshot path/i,
  );
});
```

- [x] **Step 2: Run the unit test and verify RED**

Run: `npx tsx --test tests/unit/sandbox-validation-snapshot.test.ts`

Expected: FAIL because `SandboxService` has no snapshot API.

- [x] **Step 3: Implement safe snapshots**

```ts
export interface SandboxFileSnapshot {
  path: string;
  content: string | null;
}

snapshotFiles(sandboxId: string, paths: string[]): Promise<SandboxFileSnapshot[]>;
restoreFiles(sandboxId: string, snapshots: SandboxFileSnapshot[]): Promise<void>;
```

Validate every normalized path with `/^(?:src|public)\/[A-Za-z0-9][A-Za-z0-9._/-]*$|^index\.html$/`. Resolve the provider once. Record `null` only for a provider read failure that represents an absent file; rethrow all other errors. Restore non-null snapshots with `writeFile`; remove null snapshots using a fixed `rm -f -- <validated-path>` command. Never interpolate unvalidated input into a shell command.

- [x] **Step 4: Run the focused unit test and service suite**

Run:

```powershell
npx tsx --test tests/unit/sandbox-validation-snapshot.test.ts tests/unit/sandbox-service.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add lib/sandbox/service/contracts.ts lib/sandbox/service/sandbox-service.ts tests/unit/sandbox-validation-snapshot.test.ts
git commit -m "feat: snapshot sandbox files for validation rollback"
```

---

### Task 2: Add live activation orchestration and production validation adapters

**Completed:** `81079f3`, `4f1421d`, `6710de3`, and `b9a052b` — activation rollback, durable evidence, and failure-class reviews passed after focused 24/24 tests and TypeScript verification.

**Files:**
- Create: `lib/generation/live/live-validation-activation.ts`
- Create: `lib/generation/live/production-validation.ts`
- Modify: `lib/generation/orchestration/generation-orchestrator.ts`
- Modify: `lib/generation/repository.ts`
- Create: `tests/integration/live-validation-activation.test.ts`

**Interfaces:**
- Consumes `GenerationArtifact`, durable generation context, `SandboxService`, and the existing validator/repair interfaces.
- Produces one `LiveActivationResult` with `report`, `rolledBack`, and `status`.

- [x] **Step 1: Write failing activation tests**

```ts
test("failed deterministic validation restores the sandbox and persists one failed report", async () => {
  const result = await activation.activate(fixture({ validation: failedRuntimeReport }));

  assert.equal(result.status, "failed");
  assert.equal(result.rolledBack, true);
  assert.deepEqual(sandbox.restoreCalls, [["src/App.tsx"]]);
  assert.equal(repository.persisted.length, 1);
  assert.equal(repository.persisted[0].status, "failed");
});

test("a repair that passes revalidation keeps the repair and persists passed once", async () => {
  const result = await activation.activate(fixture({
    initialReport: repairableStaticReport,
    repairedReport: passedReport,
  }));

  assert.equal(result.status, "passed");
  assert.equal(result.rolledBack, false);
  assert.equal(repair.generateCalls, 1);
  assert.equal(repository.persisted.length, 1);
});

test("missing clone or inspiration reference evidence fails without calling repair", async () => {
  const result = await activation.activate(fixture({ mode: "clone", reference: undefined }));

  assert.equal(result.status, "failed");
  assert.equal(result.report.repairEligibility?.failureClass, "capture-policy");
  assert.equal(repair.generateCalls, 0);
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `npx tsx --test tests/integration/live-validation-activation.test.ts`

Expected: FAIL because the live activation module does not exist.

- [x] **Step 3: Implement the activation boundary**

```ts
export interface LiveActivationInput extends ValidationRunInput {
  generation: { id: string; projectId: string; repairCount: number };
  applyCandidate(): Promise<void>;
  snapshotPaths: string[];
}

export interface LiveActivationResult {
  status: "passed" | "failed";
  report: ValidationReport;
  rolledBack: boolean;
}
```

`activate` must snapshot first, invoke `applyCandidate`, call a new non-persisting `orchestrator.validate`, then call `repairAndRevalidate` only for an eligible failed report. Refactor `repairAndRevalidate` to return the final report without persistence; add `persistFinal` so the activation boundary can attach rollback outcome and persist exactly once. If the final report is failed or any post-snapshot action throws, restore once, build a terminal nonrepairable report, and persist it once. Keep `validateAndPersist` as a compatibility wrapper over `validate` plus `persistFinal`.

`production-validation.ts` adapts:

```ts
validateStaticRules({ files: artifact.files, brief, plan });
validateDependencies({ artifact, templateDependencies: [] });
validateSandboxBuild(sandboxId, sandbox);
validateBrowser({ url: sandboxUrl, desktopWidth: 1440 });
```

For scratch/edit, return passed originality and honesty checks only when static validation has no error violations. For inspiration with a durable brand-language bundle, evaluate that bundle; otherwise throw `new ValidationStepError("capture-policy", "Reference evidence unavailable for live fidelity validation.")`. For clone, require a durable dual desktop/mobile reference bundle and source-layout evidence or throw the same error. Do not invent source visual data.

Add `setGenerationSandboxId(id, sandboxId)` and `persistGenerationTerminalValidation` repository wrappers; each uses parameterized SQL and existing allowlisted JSON storage.

- [x] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npx tsx --test tests/integration/live-validation-activation.test.ts tests/integration/repair-cycle.test.ts tests/integration/validation-runner.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add lib/generation/live lib/generation/orchestration/generation-orchestrator.ts lib/generation/repository.ts tests/integration/live-validation-activation.test.ts
git commit -m "feat: activate live deterministic generation validation"
```

---

### Task 3: Gate the apply SSE route and builder success state

**Files:**
- Modify: `app/api/apply-ai-code-stream/route.ts`
- Modify: `app/api/generate-ai-code-stream/route.ts`
- Modify: `app/generation/page.tsx`
- Modify: `tests/generation-builder-ui.test.cjs`
- Create: `tests/integration/live-apply-route.test.ts`
- Modify: `tests/brand-guidelines.test.cjs`

**Interfaces:**
- Apply request gains `generationContext: { generationId?: string; projectId: string; mode: "scratch" | "edit" | "inspiration" | "clone"; prompt: string; targetUrl: string | null }`.
- Candidate stream emits `candidate-ready`; only apply emits terminal `complete`.

- [x] **Step 1: Write failing route/client-contract tests**

```ts
test("apply route rejects an unscoped generated candidate", async () => {
  const response = await postApply({ response: candidate, sandboxId: "sandbox-1" });
  assert.equal(response.status, 400);
});

test("terminal apply success is emitted only after live activation passes", async () => {
  const events = await consumeApplyEvents(validContextRequest());
  assert.deepEqual(events.map((event) => event.type).slice(-2), ["validation-report", "complete"]);
});

test("generation stream emits candidate-ready instead of terminal complete", async () => {
  const events = await consumeGenerationEvents();
  assert.ok(events.some((event) => event.type === "candidate-ready"));
  assert.equal(events.some((event) => event.type === "complete"), false);
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npx tsx --test tests/integration/live-apply-route.test.ts`

Expected: FAIL because the route accepts unscoped applies and emits completion before live validation.

- [x] **Step 3: Implement server and UI wiring**

At the apply route boundary, Zod-parse `generationContext`; create the generation if it lacks an ID, set the sandbox ID, parse the existing response into a `GenerationArtifact`, and invoke the Task 2 activation boundary around the existing file-writing logic. Emit `validation-started`, `validation-report`, and rollback events. Emit `complete` only when `status === "passed"`; otherwise emit `error` with the safe report reason.

At the generation stream, rename its post-TR4 payload event from `complete` to `candidate-ready`. Preserve raw streaming, validation progress, and existing `GenerationQualityError` behavior.

At the builder, carry the original user request, active project ID, mode, and target URL into `applyGeneratedCode`. Handle `candidate-ready` as code available for application, and set `Generation complete!` only after the apply stream emits `complete`. On an apply `error`, show the report summary, keep the preview on the previous sandbox version, and do not add a success chat message.

Use `components/generation/GenerationProgressSurface.tsx` while candidate generation, application, or live validation is active. Map only existing builder state (`loadingStage`, capture/preparation flags, `generationProgress`, `codeApplicationState`, and apply events) into its six phases. The surface replaces the current empty/skeleton workspace only during active work; it is removed on terminal apply completion or error. It remains presentational and must not create sandbox, generation, or validation state. Add static builder coverage proving that the surface is rendered and that `candidate-ready`, `validation-report`, and terminal apply `complete` remain distinct.

- [x] **Step 4: Run focused tests and legacy stream tests**

Run:

```powershell
npx tsx --test tests/integration/live-apply-route.test.ts tests/integration/live-validation-activation.test.ts
node --test tests/brand-guidelines.test.cjs
npx tsc --noEmit
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add app/api/apply-ai-code-stream/route.ts app/api/generate-ai-code-stream/route.ts app/generation/page.tsx tests/integration/live-apply-route.test.ts tests/brand-guidelines.test.cjs
git commit -m "feat: gate live applies on deterministic validation"
```

---

### Task 4: Make release screenshots strictly mask-only

**Files:**
- Modify: `tests/e2e/quality-gates.spec.ts`
- Modify: `tests/e2e/quality-gates.spec.ts-snapshots/passing-*.png`
- Modify: `app/test-fixtures/passing/page.tsx`
- Create: `tests/e2e/screenshot-options.ts`
- Create: `tests/e2e/screenshot-options.test.ts`
- Create: `tests/e2e/strict-screenshot-mask.spec.ts`

**Interfaces:**
- Keeps `tests/e2e/screenshot-mask.css` as the only permitted dynamic-region exclusion.

- [x] **Step 1: Write the failing strict option and unmasked-pixel regressions**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { releaseScreenshotOptions } from "./screenshot-options";

test("release screenshots allow zero unmasked pixel difference", () => {
  assert.equal(releaseScreenshotOptions.maxDiffPixelRatio, 0);
});
```

```ts
test("an unmasked one-pixel difference is rejected by the release matcher", async ({ page }) => {
  await page.goto("/test-fixtures/passing?variant=one-pixel-diff");
  await assert.rejects(() => expect(page).toHaveScreenshot("passing.png", releaseScreenshotOptions));
});
```

- [x] **Step 2: Run it and verify RED**

Run:

```powershell
npx tsx --test tests/e2e/screenshot-options.test.ts
```

Expected: FAIL because `releaseScreenshotOptions` does not exist. After it is introduced with the legacy `0.01` value, the assertion must fail with `0.01 !== 0` before the production test is changed.

- [x] **Step 3: Set the release tolerance to zero and regenerate baselines**

Create and import `releaseScreenshotOptions` with `{ fullPage: true, animations: "disabled", stylePath: path.resolve("tests/e2e/screenshot-mask.css"), maxDiffPixelRatio: 0 }`. Keep the existing narrow CSS mask unchanged. The fixture's `variant=one-pixel-diff` server-side branch must render exactly one unmasked, one-device-pixel SVG rect. `strict-screenshot-mask.spec.ts` asserts that variant is rejected, while the normal fixture still passes because its only dynamic marker is targeted by the mask. Regenerate all five normal fixture baselines using the owned isolated 9021 Playwright config, then remove the temporary config.

- [x] **Step 4: Run isolated E2E verification**

Run:

```powershell
npx playwright test quality-gates.spec.ts --config playwright.quality-local.config.ts
npx playwright test strict-screenshot-mask.spec.ts --config playwright.quality-local.config.ts
npx tsx --test tests/e2e/screenshot-options.test.ts
```

Expected: stable fixture PASS at all five widths; explicit unmasked-diff test FAIL in RED evidence and masked dynamic case PASS in GREEN coverage.

- [x] **Step 5: Commit**

```powershell
git add app/test-fixtures/passing/page.tsx tests/e2e/quality-gates.spec.ts tests/e2e/screenshot-options.ts tests/e2e/screenshot-options.test.ts tests/e2e/strict-screenshot-mask.spec.ts tests/e2e/quality-gates.spec.ts-snapshots
git commit -m "test: require exact release screenshots outside masks"
```

## Final verification

Run serially:

```powershell
npm run test:all
npm run test:validation
npx tsc --noEmit
npx playwright test quality-gates.spec.ts --config playwright.quality-local.config.ts
```

The checked-in 9010 release command remains expected to fail only while the independently identified foreign Docker/WSL process serves a 404 at the fixture path. It must fail before screenshot acceptance; no foreign process is terminated by this plan.
