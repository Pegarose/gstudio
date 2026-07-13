# Structured Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace route-local prompt/routing logic and regex-parsed XML output with capability-routed planning and Zod-validated generation artifacts.

**Architecture:** Small modules classify intent, assemble canonical context, plan the design, generate a typed artifact, and persist stage outputs. The existing generation and apply routes remain as compatibility endpoints until the builder switches in Wave 5.

**Tech Stack:** AI SDK 5.0, Zod 3.25.76, existing AI provider packages, PostgreSQL generation repository, Redis coordination, `gstudio-agent-context`.

## Global Constraints

- Do not duplicate the core prompt or skill text outside `gstudio-agent-context`.
- Clone, inspiration, scratch, and edit are separate typed modes.
- Model roles select by capability: `vision`, `structuredOutput`, `reasoning`, and `toolUse`.
- Every model fallback must satisfy the required capability set.
- Model output cannot reach sandbox application before Zod validation.
- Do not delete the legacy parser until Wave 5.
- Keep one automatic schema-repair attempt; do not convert schema failures into unvalidated text.

---

### Task 1: Add a Capability-Based Model Registry

**Files:**
- Create: `lib/models/contracts.ts`
- Create: `lib/models/registry.ts`
- Create: `lib/models/router.ts`
- Modify: `lib/ai/provider-manager.ts:1-122`
- Modify: `config/app.config.ts:45-159`
- Create: `tests/unit/model-router.test.ts`

**Interfaces:**
- Consumes: existing provider client creation in `lib/ai/provider-manager.ts`.
- Produces: `ModelRoute`, `ModelRole`, `resolveModelRoute(role, preferredModel?)`, and `getLanguageModel(route)`.

- [ ] **Step 1: Write capability-routing tests**

```ts
// tests/unit/model-router.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createModelRouter } from "../../lib/models/router";

test("vision planning never falls back to a text-only model", () => {
  const router = createModelRouter([
    { id: "text", provider: "openai", model: "text", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
    { id: "vision", provider: "google", model: "vision", capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 10_000, fallbacks: [] },
  ]);
  assert.equal(router.resolve({ vision: true, structuredOutput: true }).id, "vision");
});

test("router throws when no route satisfies required capabilities", () => {
  const router = createModelRouter([]);
  assert.throws(() => router.resolve({ vision: true }));
});

test("OpenCode fallback can preserve a structured-output contract through Cline", () => {
  const router = createModelRouter([
    { id: "opencode-code", provider: "opencode", model: "kimi-k2.7-code", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: ["cline-code"] },
    { id: "cline-code", provider: "cline", model: "x-ai/grok-code-fast-1", capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false }, timeoutMs: 45_000, fallbacks: [] },
  ]);
  assert.equal(router.fallbacksFor("opencode-code", { structuredOutput: true })[0].id, "cline-code");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npx tsx --test tests/unit/model-router.test.ts
```

Expected: FAIL because the model router does not exist.

- [ ] **Step 3: Implement registry contracts and resolution**

```ts
// lib/models/contracts.ts
export interface ModelCapabilities {
  vision: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
  toolUse: boolean;
}

export interface ModelRoute {
  id: string;
  provider: "openai" | "anthropic" | "groq" | "google" | "opencode" | "tr4" | "cline" | "agentrouter" | "vercel-gateway";
  model: string;
  capabilities: ModelCapabilities;
  timeoutMs: number;
  fallbacks: string[];
}

export type ModelRole = "intent" | "vision-planner" | "design-planner" | "coder" | "repair";
export type CapabilityRequirement = Partial<ModelCapabilities>;
```

`router.resolve(requirement, preferredId?)` first tests the preferred route, then its ordered fallbacks, then registry order. A route matches only when every required boolean equals the route capability.

Refactor `provider-manager.ts` so it accepts a `ModelRoute` instead of re-deriving provider from model-name prefixes. OpenCode, TR4, Cline, and AgentRouter use the existing OpenAI-compatible client construction with their current base URLs and environment variables. Keep a compatibility wrapper for legacy callers until Wave 5.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/model-router.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/models lib/ai/provider-manager.ts config/app.config.ts tests/unit/model-router.test.ts
git commit -m "feat: add capability-based model routing"
```

### Task 2: Extract Canonical Prompt Assembly

**Files:**
- Create: `lib/generation/context/prompt-assembler.ts`
- Create: `lib/generation/context/project-context.ts`
- Modify: `lib/gstudio-agent-context.js`
- Create: `tests/unit/prompt-assembler.test.ts`

**Interfaces:**
- Consumes: `loadAgentContext`, generation mode, project facts, optional design plan.
- Produces: `assembleSystemContext(input): { system: string; skills: string[]; fingerprint: string }`.

- [ ] **Step 1: Write canonical-source tests**

```ts
// tests/unit/prompt-assembler.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { assembleSystemContext } from "../../lib/generation/context/prompt-assembler";

test("clone context loads clone-fidelity from the canonical directory", () => {
  const result = assembleSystemContext({
    mode: "clone",
    prompt: "Clone https://example.com",
    projectFacts: [],
    designPlan: null,
  });
  assert.ok(result.skills.includes("clone-fidelity"));
  assert.match(result.system, /Your output must look MADE, not GENERATED/);
});

test("scratch context does not load clone-fidelity", () => {
  const result = assembleSystemContext({ mode: "scratch", prompt: "Build a legal-tech site", projectFacts: [], designPlan: null });
  assert.equal(result.skills.includes("clone-fidelity"), false);
});

test("inspiration mode maps to the canonical inspire intent", () => {
  const result = assembleSystemContext({ mode: "inspiration", prompt: "Use this brand language", projectFacts: [], designPlan: null });
  assert.ok(result.skills.includes("brand-extract"));
  assert.equal(result.skills.includes("clone-fidelity"), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/prompt-assembler.test.ts
```

Expected: FAIL because the assembler does not exist.

- [ ] **Step 3: Implement deterministic assembly**

The assembler must:

1. Map public mode `inspiration` to canonical intent `inspire`. For edit mode, reuse the project's recorded base mode and pass `isEdit: true`.
2. Call `loadAgentContext` once.
3. Append project facts as JSON in a named `<project-facts>` section.
4. Append a validated plan as JSON in `<design-plan>` only when present.
5. Hash the canonical core prompt, skill names, and appended context with SHA-256.
6. Return no filesystem paths or secret environment values to the model.

Use this explicit mapping:

```ts
const agentIntent = mode === "inspiration"
  ? "inspire"
  : mode === "edit"
    ? (baseMode === "inspiration" ? "inspire" : baseMode)
    : mode;
```

```ts
const fingerprint = createHash("sha256")
  .update(JSON.stringify({ core: loaded.systemPrompt, skills: loaded.skills, projectFacts, designPlan }))
  .digest("hex");
```

- [ ] **Step 4: Run existing context tests and new tests**

Run:

```powershell
node --test tests/agent-context.test.cjs
npx tsx --test tests/unit/prompt-assembler.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/context lib/gstudio-agent-context.js tests/unit/prompt-assembler.test.ts
git commit -m "refactor: centralize canonical prompt assembly"
```

### Task 3: Define Product Brief and Design Plan Schemas

**Files:**
- Create: `lib/generation/contracts/brief.ts`
- Create: `lib/generation/contracts/plan.ts`
- Create: `lib/generation/planning/brief-normalizer.ts`
- Create: `lib/generation/planning/design-history-repository.ts`
- Modify: `scripts/migrate-db.ts`
- Create: `tests/unit/design-plan-schema.test.ts`
- Create: `tests/unit/brief-normalizer.test.ts`
- Create: `tests/integration/design-history.test.ts`

**Interfaces:**
- Consumes: generation mode, user prompt, target URL, supplied facts.
- Produces: `ProductBriefSchema`, `DesignPlanSchema`, `normalizeProductBrief()`.

- [ ] **Step 1: Write honesty and mode tests**

```ts
test("scratch brief keeps unknown proof out of content facts", () => {
  const brief = normalizeProductBrief({
    prompt: "Build a premium accounting site",
    suppliedFacts: [],
  });
  assert.deepEqual(brief.contentFacts, []);
  assert.ok(brief.prohibitedClaims.includes("invented metrics"));
});

test("clone plan requires evidence on every section", () => {
  const result = DesignPlanSchema.safeParse({
    mode: "clone",
    macrostructure: "editorial-grid",
    sectionPlan: [{ id: "hero", job: "explain", evidence: [] }],
  });
  assert.equal(result.success, false);
});

test("macrostructure rotation excludes the two most recent project shapes", async () => {
  await recordDesignHistory(projectId, { macrostructure: "bento-grid", paperBand: "light", displayStyle: "grotesk", accentHue: "cool" });
  await recordDesignHistory(projectId, { macrostructure: "marquee-hero", paperBand: "dark", displayStyle: "serif", accentHue: "warm" });
  const candidates = await getAllowedMacrostructures(projectId, ["bento-grid", "marquee-hero", "long-document"]);
  assert.deepEqual(candidates, ["long-document"]);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/design-plan-schema.test.ts tests/unit/brief-normalizer.test.ts tests/integration/design-history.test.ts
```

Expected: FAIL because schemas do not exist.

- [ ] **Step 3: Implement discriminated plan schemas**

Use a discriminated union on `mode`. Common plan fields include `macrostructure`, `sectionPlan`, `responsivePlan`, `tokenPlan`, `componentInventory`, `contentPlan`, `assetPlan`, and `interactionPlan`.

Clone sections require at least one evidence item:

```ts
const CloneSectionSchema = SectionPlanSchema.extend({
  evidence: z.array(PlanEvidenceSchema).min(1),
});

export const DesignPlanSchema = z.discriminatedUnion("mode", [
  ClonePlanSchema,
  InspirationPlanSchema,
  ScratchPlanSchema,
  EditPlanSchema,
]);
```

The normalizer may infer audience and primary action from explicit prompt language, but must place no inferred statement in `contentFacts`.

Add an idempotent history table:

```sql
CREATE TABLE IF NOT EXISTS project_design_history (
  id BIGSERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  macrostructure VARCHAR(80) NOT NULL,
  paper_band VARCHAR(20) NOT NULL,
  display_style VARCHAR(30) NOT NULL,
  accent_hue VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`getAllowedMacrostructures` excludes the two most recent shapes when at least one candidate remains. The plan generator records history only after the plan passes schema validation.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx tsx scripts/migrate-db.ts
npx tsx --test tests/unit/design-plan-schema.test.ts tests/unit/brief-normalizer.test.ts tests/integration/design-history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/migrate-db.ts lib/generation/contracts lib/generation/planning tests/unit/design-plan-schema.test.ts tests/unit/brief-normalizer.test.ts tests/integration/design-history.test.ts
git commit -m "feat: define product brief and design plan schemas"
```

### Task 4: Generate Structured Plans Through AI SDK

**Files:**
- Create: `lib/generation/planning/plan-generator.ts`
- Create: `lib/generation/planning/messages.ts`
- Create: `tests/unit/plan-generator.test.ts`

**Interfaces:**
- Consumes: model router, prompt assembler, `ProductBrief`, optional reference image parts.
- Produces: `generateDesignPlan(input): Promise<DesignPlan>`.

- [ ] **Step 1: Write structured-output tests with an injected model call**

```ts
test("plan generator validates the returned plan", async () => {
  const plan = await generateDesignPlan({
    mode: "scratch",
    brief: scratchBriefFixture,
    reference: null,
    callModel: async () => ({ output: scratchPlanFixture }),
  });
  assert.equal(plan.mode, "scratch");
});

test("plan generator rejects a model plan with invented evidence", async () => {
  await assert.rejects(() => generateDesignPlan({
    mode: "clone",
    brief: cloneBriefFixture,
    reference: cloneReferenceFixture,
    callModel: async () => ({ output: { ...clonePlanFixture, sectionPlan: [{ id: "hero", job: "explain", evidence: [] }] } }),
  }));
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/plan-generator.test.ts
```

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement structured plan generation**

Use AI SDK structured output:

```ts
const result = await streamText({
  model,
  system: context.system,
  messages,
  experimental_output: Output.object({ schema: DesignPlanSchema }),
  abortSignal,
});

const output = await result.experimental_output;
return DesignPlanSchema.parse(output);
```

For clone mode, `messages` contains text plus desktop and mobile `{ type: "image", image }` parts. The reference argument remains optional until Wave 3 provides durable image artifacts.

- [ ] **Step 4: Run tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/plan-generator.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/planning tests/unit/plan-generator.test.ts
git commit -m "feat: generate structured design plans"
```

### Task 5: Define and Generate Structured Code Artifacts

**Files:**
- Create: `lib/generation/contracts/artifact.ts`
- Create: `lib/generation/artifact/artifact-generator.ts`
- Create: `lib/generation/artifact/path-policy.ts`
- Create: `tests/unit/generation-artifact.test.ts`

**Interfaces:**
- Consumes: validated `DesignPlan`, project file context, code model route.
- Produces: `GenerationArtifactSchema`, `generateArtifact`, `validateGeneratedPath`.

- [ ] **Step 1: Write artifact safety tests**

```ts
test("artifact rejects traversal and absolute paths", () => {
  assert.equal(validateGeneratedPath("../../secrets"), false);
  assert.equal(validateGeneratedPath("C:\\secrets.txt"), false);
  assert.equal(validateGeneratedPath("src/App.tsx"), true);
});

test("artifact rejects duplicate file paths", () => {
  const result = GenerationArtifactSchema.safeParse({
    preview: previewFixture,
    files: [{ path: "src/App.tsx", content: "a" }, { path: "src/App.tsx", content: "b" }],
    packages: [],
    declaredGate: gateFixture,
    generationNotes: [],
  });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/unit/generation-artifact.test.ts
```

Expected: FAIL because artifact modules do not exist.

- [ ] **Step 3: Implement the schema and generator**

```ts
export const GeneratedFileSchema = z.object({
  path: z.string().refine(validateGeneratedPath),
  content: z.string(),
});

export const GenerationArtifactSchema = z.object({
  preview: GenerationPreviewSchema,
  files: z.array(GeneratedFileSchema).min(1).superRefine(rejectDuplicatePaths),
  packages: z.array(z.string().regex(/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i)).default([]),
  declaredGate: QualityGateScoreSchema,
  generationNotes: z.array(z.string()).default([]),
});
```

Call `streamText` with `experimental_output: Output.object({ schema: GenerationArtifactSchema })`. Permit one schema-only retry containing Zod issue paths; do not include the previous invalid output as executable code.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npx tsx --test tests/unit/generation-artifact.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/contracts/artifact.ts lib/generation/artifact tests/unit/generation-artifact.test.ts
git commit -m "feat: generate schema-validated code artifacts"
```

### Task 6: Build the Staged Generation Orchestrator

**Files:**
- Create: `lib/generation/orchestration/generation-orchestrator.ts`
- Create: `lib/generation/orchestration/stage-runner.ts`
- Create: `lib/generation/orchestration/errors.ts`
- Create: `tests/integration/generation-orchestrator.test.ts`

**Interfaces:**
- Consumes: repositories, coordination, brief normalizer, plan generator, artifact generator.
- Produces: `runGeneration(generationId, dependencies)` and typed stage events.

- [ ] **Step 1: Write stage-order and cancellation tests**

```ts
test("scratch generation persists planning before generating", async () => {
  const stages: string[] = [];
  await runGeneration("generation-1", fakeDependencies({ onStage: (stage) => stages.push(stage) }));
  assert.deepEqual(stages, ["planning", "generating", "applying", "validating", "completed"]);
});

test("cancelled generation does not enter the next stage", async () => {
  const deps = fakeDependencies({ cancelledAt: "generating" });
  await assert.rejects(() => runGeneration("generation-2", deps), GenerationCancelledError);
  assert.equal(deps.applyCalls, 0);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/generation-orchestrator.test.ts
```

Expected: FAIL because the orchestrator does not exist.

- [ ] **Step 3: Implement the stage runner**

For each stage:

1. Check cancellation.
2. Persist stage and `running` status.
3. Append the event to `generation_events` with the next sequence.
4. Publish the same persisted event through Redis.
5. Execute the typed stage function.
6. Persist its output before continuing.

Wrap the entire run in the generation Redis lock. On error, persist a safe typed error and publish terminal `failed`. Always release the ownership token in `finally`.

Capture is a no-op for scratch mode in this wave and a dependency hook for clone/inspiration until Wave 3.

- [ ] **Step 4: Run orchestrator tests**

Run:

```powershell
npx tsx --test tests/integration/generation-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/orchestration tests/integration/generation-orchestrator.test.ts
git commit -m "feat: orchestrate staged generations"
```

### Task 7: Add New Structured Generate and Apply Endpoints

**Files:**
- Create: `app/api/generations/[generationId]/run/route.ts`
- Create: `app/api/generations/[generationId]/artifact/route.ts`
- Create: `lib/generation/artifact/artifact-applier.ts`
- Modify: `app/api/apply-ai-code-stream/route.ts:24-799` only to delegate new structured requests while preserving legacy text requests.
- Create: `tests/integration/structured-generation-routes.test.ts`

**Interfaces:**
- Consumes: generation orchestrator, `GenerationArtifact`, `SandboxService`.
- Produces: `POST /api/generations/:id/run`, `GET /api/generations/:id/artifact`, and `applyArtifact(sandboxId, artifact)`.

- [ ] **Step 1: Write route and apply tests**

```ts
test("artifact applier writes only validated files", async () => {
  const writes: string[] = [];
  await applyArtifact("sandbox-1", artifactFixture, {
    writeFiles: async (_id, files) => writes.push(...files.map((file) => file.path)),
    installPackages: async () => ({ stdout: "", stderr: "", exitCode: 0, success: true }),
  } as never);
  assert.deepEqual(writes, ["src/App.tsx", "src/index.css"]);
});
```

The run route test must assert `202`, then observe persisted `planning` and terminal status through repository polling.

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/structured-generation-routes.test.ts
```

Expected: FAIL because the endpoints and applier do not exist.

- [ ] **Step 3: Implement endpoint delegation**

The run endpoint verifies the generation exists and is `queued` or retryable `failed`, starts orchestration without holding the HTTP response open, and returns `202` with the events URL.

`artifact-applier.ts` validates the artifact again, installs its package list once, writes files through `SandboxService`, and records the resulting project version only after successful writes.

The legacy apply route detects structured requests by a validated `{ generationId, sandboxId }` body and delegates; its existing XML parsing branch remains for the current builder until Wave 5.

- [ ] **Step 4: Run Wave 2 verification**

Run:

```powershell
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/api/generations lib/generation/artifact/artifact-applier.ts app/api/apply-ai-code-stream/route.ts tests/integration/structured-generation-routes.test.ts
git commit -m "feat: expose structured generation pipeline"
```

## Wave 2 Completion Check

Run:

```powershell
rg -n "<file>|<packages>|parseAIResponse" lib/generation app/api/generations
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: the search returns no XML parser usage in new modules or new generation routes; tests pass. Legacy route matches are allowed only outside those paths.
