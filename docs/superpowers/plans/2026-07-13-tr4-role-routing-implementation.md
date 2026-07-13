# TR4-Only Model Role Routing Implementation Plan

> **Execution record (2026-07-13):** Tasks 1-6 were completed through `b5939d3`; each implementation task received a clean review after the Task 5 terminal-SSE-error fix. The final serial verification recorded 76/76 tests, TypeScript, production build, active-route scan, live TR4 model availability, and browser smoke evidence in `.superpowers/sdd/task-6-report.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all active G Studio model roles through TR4, normalize stale OpenCode selections, and enforce a real QA review with at most one automatic repair before generated code is applied.

**Architecture:** Add one browser-safe team-model policy that owns role defaults, allowed choices, and legacy normalization. Make the model registry TR4-only and have both generation APIs resolve models through it. Add a pure quality-gate orchestrator around AI SDK review/repair adapters, then integrate its progress and terminal result into the existing SSE flow without replacing the current builder or sandbox pipeline.

**Tech Stack:** Next.js 15.4 App Router, TypeScript 5, AI SDK 5 with `@ai-sdk/openai` 2, Zod 3, Node test runner, PostgreSQL-backed project persistence, E2B sandboxing.

## Global Constraints

- The only active provider is `tr4` through `TR4_API_BASE`, normalized to `https://api.tr4.net/v1`, and `TR4_API_KEY`.
- Planning / Architect defaults to `gpt-5.6-terra`.
- Coding / Worker defaults to `gpt-5.3-codex-spark`.
- QA / Validator defaults to `codex-auto-review`.
- Intent analysis uses `gpt-5.4-mini`; design analysis uses `gemini-3.1-pro-low`; visual analysis uses `gemini-3.1-flash-image`; repair uses `gpt-5.6-sol`.
- OpenCode and Cline must not appear in an active route, fallback, or API request.
- Validator repair is capped at one attempt; a second failed review blocks apply.
- Existing E2B allocation, apply, rollback, package detection, and Vite monitoring behavior must remain intact.
- Do not add a second durable generation runner in this change; the existing `validation_json` orchestration migration remains separate.

---

## Execution Preflight: Preserve the Verified Baseline

**Files:**
- Stage only the existing verified generation-quality implementation files; exclude `.codex-9020*.log`, `.playwright-cli/`, and `output/`.

- [ ] **Step 1: Re-run the verified baseline**

Run:

```powershell
npm run test:all
npx tsc --noEmit
npm run build
git diff --check
```

Expected: 61 tests pass, TypeScript exits `0`, Next.js build exits `0`, and `git diff --check` prints no errors. Existing `next/image` and Browserslist warnings are non-blocking.

- [ ] **Step 2: Commit the pre-existing verified changes**

Run:

```powershell
git add -- AGENTS.md app/api/analyze-edit-intent/route.ts app/api/generate-ai-code-stream/route.ts app/generation/page.tsx config/app.config.ts docs/superpowers/plans/2026-07-13-structured-generation-pipeline.md lib/ai/provider-manager.ts lib/models/contracts.ts lib/sandbox/providers/e2b-provider.ts lib/sandbox/sandbox-manager.ts tests/generation-builder-ui.test.cjs tests/generation-intent-ui.test.cjs tests/unit/e2b-provider.test.ts tests/unit/model-router.test.ts tests/unit/sandbox-manager.test.ts
git commit -m "fix: stabilize generation provider and sandbox lifecycle"
```

Expected: one commit containing the already-tested provider, timeout, sandbox, and Cline-removal work; local logs and browser artifacts remain untracked.

---

### Task 1: Central TR4 Team-Model Policy and Registry

**Files:**
- Create: `lib/models/team-model-policy.ts`
- Modify: `lib/models/contracts.ts`
- Modify: `lib/models/registry.ts`
- Modify: `config/app.config.ts`
- Test: `tests/unit/team-model-policy.test.ts`
- Test: `tests/unit/model-router.test.ts`

**Interfaces:**
- Produces: `TeamModelRole = "planning" | "coder" | "qa"`.
- Produces: `normalizeTeamModel(role, selectedModel): string`.
- Produces: `resolveTeamModelRoute(role, selectedModel): ModelRoute`.
- Produces: `appConfig.ai.teamModelDefaults` and `appConfig.ai.teamModelOptions`.

- [ ] **Step 1: Write failing policy and registry tests**

Create `tests/unit/team-model-policy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { appConfig } from "../../config/app.config";
import { normalizeTeamModel, resolveTeamModelRoute } from "../../lib/models/team-model-policy";

test("team role defaults use the approved TR4 models", () => {
  assert.deepEqual(appConfig.ai.teamModelDefaults, {
    planning: "gpt-5.6-terra",
    coder: "gpt-5.3-codex-spark",
    qa: "codex-auto-review",
  });
});

test("legacy unavailable selections normalize by role", () => {
  assert.equal(normalizeTeamModel("planning", "deepseek-v4-pro"), "gpt-5.6-terra");
  assert.equal(normalizeTeamModel("coder", "kimi-k2.7-code"), "gpt-5.3-codex-spark");
  assert.equal(normalizeTeamModel("qa", "deepseek-v4-pro"), "codex-auto-review");
});

test("unknown and missing selections use role defaults", () => {
  assert.equal(normalizeTeamModel("planning", undefined), "gpt-5.6-terra");
  assert.equal(normalizeTeamModel("coder", "unknown-model"), "gpt-5.3-codex-spark");
  assert.equal(normalizeTeamModel("qa", null), "codex-auto-review");
});

test("resolved team routes always use TR4", () => {
  for (const role of ["planning", "coder", "qa"] as const) {
    const route = resolveTeamModelRoute(role, undefined);
    assert.equal(route.provider, "tr4");
    assert.equal(route.fallbacks.length, 0);
    assert.equal(route.model, appConfig.ai.teamModelDefaults[role]);
  }
});

test("the active registry contains no quota-exhausted provider", () => {
  assert.equal(appConfig.ai.modelRoutes.every((route) => route.provider === "tr4"), true);
});
```

Update the expectations in `tests/unit/model-router.test.ts`:

```ts
test("resolveModelRoute selects the approved TR4 role defaults", () => {
  assert.equal(resolveModelRoute("planning").model, "gpt-5.6-terra");
  assert.equal(resolveModelRoute("coder").model, "gpt-5.3-codex-spark");
  assert.equal(resolveModelRoute("qa").model, "codex-auto-review");
  assert.equal(resolveModelRoute("repair").model, "gpt-5.6-sol");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx tsx --test tests/unit/team-model-policy.test.ts tests/unit/model-router.test.ts
```

Expected: FAIL because `team-model-policy.ts`, `teamModelDefaults`, and the `planning`/`qa` model roles do not exist.

- [ ] **Step 3: Define role defaults and TR4-only routes**

At the top of `config/app.config.ts`, before `appConfig`, add:

```ts
const teamModelDefaults = {
  planning: "gpt-5.6-terra",
  coder: "gpt-5.3-codex-spark",
  qa: "codex-auto-review",
} as const;

const teamModelOptions = {
  planning: [
    "gpt-5.6-terra",
    "gpt-5.4",
    "claude-opus-4-6-thinking",
    "claude-sonnet-4-6",
  ],
  coder: [
    "gpt-5.3-codex-spark",
    "gpt-5.6-sol",
    "kimi-k2.7-code-highspeed",
    "claude-sonnet-4-6",
  ],
  qa: [
    "codex-auto-review",
    "gpt-5.6-sol",
    "gpt-5.4-mini",
  ],
} as const;
```

Replace `defaultModel`, `availableModels`, `modelRoutes`, and `modelRoleRoutes` with:

```ts
defaultModel: teamModelDefaults.coder,
availableModels: [...new Set(Object.values(teamModelOptions).flat())],
teamModelDefaults,
teamModelOptions,
modelRoutes: [
  {
    id: "intent-tr4", provider: "tr4", model: "gpt-5.4-mini",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 30_000, fallbacks: [],
  },
  {
    id: "vision-tr4", provider: "tr4", model: "gemini-3.1-flash-image",
    capabilities: { vision: true, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 45_000, fallbacks: [],
  },
  {
    id: "design-tr4", provider: "tr4", model: "gemini-3.1-pro-low",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 45_000, fallbacks: [],
  },
  {
    id: "planning-tr4", provider: "tr4", model: "gpt-5.6-terra",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 60_000, fallbacks: [],
  },
  {
    id: "coder-tr4", provider: "tr4", model: "gpt-5.3-codex-spark",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 180_000, fallbacks: [],
  },
  {
    id: "qa-tr4", provider: "tr4", model: "codex-auto-review",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 90_000, fallbacks: [],
  },
  {
    id: "repair-tr4", provider: "tr4", model: "gpt-5.6-sol",
    capabilities: { vision: false, structuredOutput: true, reasoning: true, toolUse: false },
    timeoutMs: 180_000, fallbacks: [],
  },
] satisfies readonly ModelRoute[],
modelRoleRoutes: {
  intent: "intent-tr4",
  "vision-planner": "vision-tr4",
  "design-planner": "design-tr4",
  planning: "planning-tr4",
  coder: "coder-tr4",
  qa: "qa-tr4",
  repair: "repair-tr4",
} satisfies Record<ModelRole, string>,
```

Keep display names only for the models still referenced by internal routes or role options. Every retained display label must end in `(TR4)`.

- [ ] **Step 4: Add the planning and QA registry roles**

Change `ModelRole` in `lib/models/contracts.ts` to:

```ts
export type ModelRole =
  | "intent"
  | "vision-planner"
  | "design-planner"
  | "planning"
  | "coder"
  | "qa"
  | "repair";
```

Add to `roleRequirements` in `lib/models/registry.ts`:

```ts
planning: { structuredOutput: true, reasoning: true },
qa: { structuredOutput: true, reasoning: true },
```

- [ ] **Step 5: Implement the browser-safe team-model policy**

Create `lib/models/team-model-policy.ts`:

```ts
import { appConfig } from "@/config/app.config";
import type { ModelRole, ModelRoute } from "./contracts";
import { resolveModelRoute } from "./registry";

export type TeamModelRole = keyof typeof appConfig.ai.teamModelDefaults;

const legacyModels: Record<TeamModelRole, Record<string, string>> = {
  planning: {
    "deepseek-v4-pro": appConfig.ai.teamModelDefaults.planning,
    "gpt-5.5": appConfig.ai.teamModelDefaults.planning,
  },
  coder: {
    "kimi-k2.7-code": appConfig.ai.teamModelDefaults.coder,
    "qwen3.7-max": appConfig.ai.teamModelDefaults.coder,
  },
  qa: {
    "deepseek-v4-pro": appConfig.ai.teamModelDefaults.qa,
    "qwen3.7-max": appConfig.ai.teamModelDefaults.qa,
  },
};

const registryRoles: Record<TeamModelRole, ModelRole> = {
  planning: "planning",
  coder: "coder",
  qa: "qa",
};

export function normalizeTeamModel(
  role: TeamModelRole,
  selectedModel: string | null | undefined,
): string {
  const mappedModel = selectedModel ? legacyModels[role][selectedModel] ?? selectedModel : undefined;
  const options = appConfig.ai.teamModelOptions[role] as readonly string[];
  return mappedModel && options.includes(mappedModel)
    ? mappedModel
    : appConfig.ai.teamModelDefaults[role];
}

export function resolveTeamModelRoute(
  role: TeamModelRole,
  selectedModel: string | null | undefined,
): ModelRoute {
  const baseRoute = resolveModelRoute(registryRoles[role]);
  const model = normalizeTeamModel(role, selectedModel);
  return { ...baseRoute, id: `${baseRoute.id}:${model}`, model, fallbacks: [] };
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npx tsx --test tests/unit/team-model-policy.test.ts tests/unit/model-router.test.ts
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- config/app.config.ts lib/models/contracts.ts lib/models/registry.ts lib/models/team-model-policy.ts tests/unit/team-model-policy.test.ts tests/unit/model-router.test.ts
git commit -m "feat: define TR4-only team model policy"
```

---

### Task 2: Role-Specific UI Defaults and Legacy Hydration

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/generation/page.tsx`
- Test: `tests/generation-builder-ui.test.cjs`
- Test: `tests/generation-intent-ui.test.cjs`

**Interfaces:**
- Consumes: `normalizeTeamModel`, `appConfig.ai.teamModelDefaults`, and `appConfig.ai.teamModelOptions` from Task 1.
- Produces: normalized Planning/Coding/QA values in state, session storage, project creation, and project settings.

- [ ] **Step 1: Write failing UI contract tests**

Add to `tests/generation-builder-ui.test.cjs`:

```js
test('dashboard and builder use role-specific TR4 defaults and options', () => {
  assert.match(dashboard, /normalizeTeamModel\("planning"/);
  assert.match(dashboard, /normalizeTeamModel\("coder"/);
  assert.match(dashboard, /normalizeTeamModel\("qa"/);
  assert.match(dashboard, /selectedQaModel/);
  assert.match(source, /teamModelOptions\.planning/);
  assert.match(source, /teamModelOptions\.coder/);
  assert.match(source, /teamModelOptions\.qa/);
});

test('stale project and session models are normalized during hydration', () => {
  assert.match(source, /normalizeTeamModel\('planning', storedPlanningModel\)/);
  assert.match(source, /normalizeTeamModel\('coder', storedCoderModel\)/);
  assert.match(source, /normalizeTeamModel\('qa', storedQaModel\)/);
  assert.match(source, /normalizeTeamModel\('planning', data\.project\.planning_model\)/);
});
```

Ensure the test file exposes both `dashboard` (`app/page.tsx`) and `source` (`app/generation/page.tsx`) strings.

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```powershell
node --test tests/generation-builder-ui.test.cjs tests/generation-intent-ui.test.cjs
```

Expected: FAIL because the pages still use the generic `availableModels` list and raw stored values.

- [ ] **Step 3: Normalize dashboard project roles**

In `app/page.tsx`, import the helper:

```ts
import { normalizeTeamModel } from "@/lib/models/team-model-policy";
```

Add `qaModel: string;` immediately after `coderModel: string;` in the existing `Project` interface, then replace the three role states with:

```ts
const [planningModel, setPlanningModel] = useState(() => normalizeTeamModel("planning", undefined));
const [coderModel, setCoderModel] = useState(() => normalizeTeamModel("coder", undefined));
const [qaModel, setQaModel] = useState(() => normalizeTeamModel("qa", undefined));
```

Normalize database mapping and session writes:

```ts
planningModel: normalizeTeamModel("planning", p.planning_model),
coderModel: normalizeTeamModel("coder", p.coder_model),
qaModel: normalizeTeamModel("qa", p.qa_model),
```

```ts
sessionStorage.setItem("selectedPlanningModel", normalizeTeamModel("planning", planningModel));
sessionStorage.setItem("selectedCoderModel", normalizeTeamModel("coder", coderModel));
sessionStorage.setItem("selectedQaModel", normalizeTeamModel("qa", qaModel));
```

When reopening a project, write all three normalized project values. Replace the two-column role grid with `md:grid-cols-3`, keep the existing Planning and Coder cards, and add a QA card whose options are:

```tsx
{appConfig.ai.teamModelOptions.qa.map((model) => (
  <option key={model} value={model}>
    {appConfig.ai.modelDisplayNames[model] || model}
  </option>
))}
```

Use `teamModelOptions.planning` and `teamModelOptions.coder` in the other two selects.

- [ ] **Step 4: Normalize builder initialization and hydration**

In `app/generation/page.tsx`, import `normalizeTeamModel` and replace role initializers with:

```ts
const [planningModel, setPlanningModel] = useState(() =>
  normalizeTeamModel("planning", searchParams.get("planningModel")),
);
const [coderModel, setCoderModel] = useState(() =>
  normalizeTeamModel("coder", searchParams.get("coderModel")),
);
const [qaModel, setQaModel] = useState(() =>
  normalizeTeamModel("qa", searchParams.get("qaModel")),
);
```

Normalize every session and database hydration assignment:

```ts
setPlanningModel(normalizeTeamModel("planning", storedPlanningModel));
setCoderModel(normalizeTeamModel("coder", storedCoderModel));
setQaModel(normalizeTeamModel("qa", storedQaModel));
```

```ts
setPlanningModel(normalizeTeamModel("planning", data.project.planning_model));
setCoderModel(normalizeTeamModel("coder", data.project.coder_model));
setQaModel(normalizeTeamModel("qa", data.project.qa_model));
```

Use `teamModelOptions.planning`, `teamModelOptions.coder`, and `teamModelOptions.qa` in the three settings selects. Include `generationMode` in both request bodies sent to `/api/generate-ai-code-stream`:

```ts
generationMode,
planningModel,
coderModel,
qaModel,
```

- [ ] **Step 5: Run UI tests and TypeScript**

Run:

```powershell
node --test tests/generation-builder-ui.test.cjs tests/generation-intent-ui.test.cjs
npx tsc --noEmit
```

Expected: focused tests pass and TypeScript exits `0`.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- app/page.tsx app/generation/page.tsx tests/generation-builder-ui.test.cjs tests/generation-intent-ui.test.cjs
git commit -m "feat: normalize team model selections to TR4"
```

---

### Task 3: TR4-Only Generation and Intent API Routing

**Files:**
- Modify: `lib/ai/provider-manager.ts`
- Modify: `app/api/generate-ai-code-stream/route.ts`
- Modify: `app/api/analyze-edit-intent/route.ts`
- Test: `tests/generation-intent-ui.test.cjs`
- Test: `tests/unit/model-router.test.ts`

**Interfaces:**
- Consumes: `resolveTeamModelRoute`, `resolveModelRoute`, and `getLanguageModel`.
- Produces: early TR4 configuration validation and a single TR4 model path for generation, intent, truncation recovery, QA, and repair.

- [ ] **Step 1: Write failing route-contract tests**

Replace the previous OpenCode fallback assertions in `tests/generation-intent-ui.test.cjs` with:

```js
test('generation and intent routes resolve only TR4 models', () => {
  assert.match(route, /resolveTeamModelRoute/);
  assert.match(route, /getLanguageModel/);
  assert.match(intentRoute, /resolveModelRoute\("intent"\)/);
  assert.doesNotMatch(route, /OPENCODEGO_API_KEY|opencodeClient|provider === 'opencode'/);
  assert.doesNotMatch(intentRoute, /OPENCODEGO_API_KEY|opencodeClient|provider === 'opencode'/);
});

test('generation requests fail clearly when TR4 is not configured', () => {
  assert.match(route, /assertTr4Configured\(\)/);
  assert.match(intentRoute, /assertTr4Configured\(\)/);
});
```

Add to `tests/unit/model-router.test.ts`:

```ts
test("TR4 provider normalizes the configured base URL to v1", () => {
  const previousBase = process.env.TR4_API_BASE;
  const previousKey = process.env.TR4_API_KEY;
  process.env.TR4_API_BASE = "https://api.tr4.net";
  process.env.TR4_API_KEY = "test-key";

  try {
    const model = getLanguageModel(resolveModelRoute("coder")) as unknown as {
      config: { url: (options: { path: string }) => URL };
    };
    assert.equal(model.config.url({ path: "/chat/completions" }).toString().startsWith("https://api.tr4.net/v1"), true);
  } finally {
    if (previousBase === undefined) delete process.env.TR4_API_BASE;
    else process.env.TR4_API_BASE = previousBase;
    if (previousKey === undefined) delete process.env.TR4_API_KEY;
    else process.env.TR4_API_KEY = previousKey;
  }
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run:

```powershell
node --test tests/generation-intent-ui.test.cjs
npx tsx --test tests/unit/model-router.test.ts
```

Expected: FAIL because both routes still instantiate OpenCode/legacy clients and `assertTr4Configured` does not exist.

- [ ] **Step 3: Add explicit server-side TR4 configuration validation**

In `lib/ai/provider-manager.ts`, add:

```ts
export function assertTr4Configured(): void {
  if (!process.env.TR4_API_KEY || !process.env.TR4_API_BASE) {
    throw new Error("TR4_API_KEY and TR4_API_BASE must be configured before generation");
  }
}
```

Keep the existing `withV1Suffix` behavior for `provider: "tr4"`.

- [ ] **Step 4: Replace generation provider heuristics with the role policy**

In `app/api/generate-ai-code-stream/route.ts`:

1. Remove `createGroq`, `createAnthropic`, `createOpenAI`, and `createGoogleGenerativeAI` imports and every module-level provider client.
2. Import:

```ts
import { assertTr4Configured, getLanguageModel } from "@/lib/ai/provider-manager";
import { resolveModelRoute } from "@/lib/models/registry";
import { resolveTeamModelRoute } from "@/lib/models/team-model-policy";
```

3. Extend request parsing:

```ts
const {
  prompt,
  model,
  context,
  isEdit = false,
  planningModel,
  coderModel,
  qaModel,
  generationMode = "build",
  generationIntent,
} = await request.json();

assertTr4Configured();
```

4. Replace the provider-selection block with:

```ts
const generationRole = generationMode === "plan" ? "planning" : "coder";
const selectedModel = generationRole === "planning" ? planningModel ?? model : coderModel ?? model;
const generationRoute = resolveTeamModelRoute(generationRole, selectedModel);
const activeLanguageModel = getLanguageModel(generationRoute);
const actualModel = generationRoute.model;

console.log(
  `[generate-ai-code-stream] Using TR4 ${generationRole} model: ${actualModel}`,
);
```

Set `streamOptions.model` to `activeLanguageModel`. Apply OpenAI provider metadata only when `actualModel.startsWith("gpt-")`; do not set temperature on GPT reasoning models. Remove the OpenCode-to-TR4 branch from stream error handling and report:

```ts
error: `TR4 ${actualModel} failed: ${streamError.message}`,
```

For truncation recovery, use:

```ts
const recoveryModel = getLanguageModel(resolveModelRoute("repair"));
```

instead of selecting Groq/OpenAI/Anthropic from the requested model string.

- [ ] **Step 5: Make edit-intent analysis use its fixed TR4 role**

In `app/api/analyze-edit-intent/route.ts`, remove every legacy provider import/client and `getModelProvider`. Import:

```ts
import { assertTr4Configured, getLanguageModel } from "@/lib/ai/provider-manager";
import { resolveModelRoute } from "@/lib/models/registry";
```

After validating the request, resolve once:

```ts
assertTr4Configured();
const intentRoute = resolveModelRoute("intent");
const aiModel = getLanguageModel(intentRoute);
console.log(`[analyze-edit-intent] Using TR4 intent model: ${intentRoute.model}`);
```

Call `generateObject` once with this model and preserve the existing schema/messages. Remove the OpenCode fallback catch; allow the outer handler to return the TR4 error.

- [ ] **Step 6: Run route tests and TypeScript**

Run:

```powershell
node --test tests/generation-intent-ui.test.cjs
npx tsx --test tests/unit/model-router.test.ts
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- lib/ai/provider-manager.ts app/api/generate-ai-code-stream/route.ts app/api/analyze-edit-intent/route.ts tests/generation-intent-ui.test.cjs tests/unit/model-router.test.ts
git commit -m "refactor: route generation exclusively through TR4"
```

---

### Task 4: Pure QA Gate With One Repair Attempt

**Files:**
- Create: `lib/generation/quality-gate.ts`
- Test: `tests/unit/generation-quality-gate.test.ts`

**Interfaces:**
- Produces: `GenerationValidationSchema` and `GenerationValidation`.
- Produces: `runGenerationQualityGate(input): Promise<QualityGateResult>`.
- Produces: `GenerationQualityError` with the final validation and repair count.

- [ ] **Step 1: Write failing quality-gate tests**

Create `tests/unit/generation-quality-gate.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  GenerationQualityError,
  runGenerationQualityGate,
  type GenerationValidation,
} from "../../lib/generation/quality-gate";

const pass: GenerationValidation = { pass: true, summary: "ready", findings: [] };
const fail: GenerationValidation = {
  pass: false,
  summary: "blocking issue",
  findings: [{
    severity: "blocking",
    category: "correctness",
    file: "src/App.jsx",
    message: "The component is incomplete",
    repairInstruction: "Return the complete component",
  }],
};

test("passing candidates are not repaired", async () => {
  let repairs = 0;
  const result = await runGenerationQualityGate({
    candidate: "candidate-v1",
    review: async () => pass,
    repair: async () => { repairs += 1; return "candidate-v2"; },
  });

  assert.equal(result.candidate, "candidate-v1");
  assert.equal(result.repairCount, 0);
  assert.equal(repairs, 0);
});

test("a failed candidate is repaired once and reviewed again", async () => {
  const reviews = [fail, pass];
  const stages: string[] = [];
  const result = await runGenerationQualityGate({
    candidate: "candidate-v1",
    review: async () => reviews.shift()!,
    repair: async () => "candidate-v2",
    onStage: async (stage) => { stages.push(stage); },
  });

  assert.equal(result.candidate, "candidate-v2");
  assert.equal(result.repairCount, 1);
  assert.deepEqual(stages, ["validating", "repairing", "validating"]);
});

test("a second failed review blocks the candidate", async () => {
  await assert.rejects(
    () => runGenerationQualityGate({
      candidate: "candidate-v1",
      review: async () => fail,
      repair: async () => "candidate-v2",
    }),
    (error: unknown) => {
      assert.equal(error instanceof GenerationQualityError, true);
      assert.equal((error as GenerationQualityError).repairCount, 1);
      return true;
    },
  );
});
```

- [ ] **Step 2: Run quality-gate tests and verify RED**

Run:

```powershell
npx tsx --test tests/unit/generation-quality-gate.test.ts
```

Expected: FAIL because `lib/generation/quality-gate.ts` does not exist.

- [ ] **Step 3: Implement the pure gate**

Create `lib/generation/quality-gate.ts`:

```ts
import { z } from "zod";

export const GenerationValidationSchema = z.object({
  pass: z.boolean(),
  summary: z.string().min(1),
  findings: z.array(z.object({
    severity: z.enum(["blocking", "warning"]),
    category: z.enum([
      "correctness",
      "completeness",
      "imports",
      "responsive",
      "accessibility",
      "design-tokens",
      "honest-content",
    ]),
    file: z.string().nullable(),
    message: z.string().min(1),
    repairInstruction: z.string().min(1),
  })),
});

export type GenerationValidation = z.infer<typeof GenerationValidationSchema>;
export type QualityGateStage = "validating" | "repairing";

export interface QualityGateResult {
  candidate: string;
  validation: GenerationValidation;
  repairCount: number;
}

export class GenerationQualityError extends Error {
  constructor(
    message: string,
    public readonly validation: GenerationValidation,
    public readonly repairCount: number,
  ) {
    super(message);
    this.name = "GenerationQualityError";
  }
}

export async function runGenerationQualityGate(input: {
  candidate: string;
  review: (candidate: string) => Promise<GenerationValidation>;
  repair: (candidate: string, validation: GenerationValidation) => Promise<string>;
  onStage?: (stage: QualityGateStage, repairCount: number) => Promise<void> | void;
  maxRepairs?: number;
}): Promise<QualityGateResult> {
  const maxRepairs = input.maxRepairs ?? 1;
  let candidate = input.candidate;
  let repairCount = 0;

  await input.onStage?.("validating", repairCount);
  let validation = await input.review(candidate);

  while (!validation.pass && repairCount < maxRepairs) {
    await input.onStage?.("repairing", repairCount);
    candidate = await input.repair(candidate, validation);
    repairCount += 1;
    await input.onStage?.("validating", repairCount);
    validation = await input.review(candidate);
  }

  if (!validation.pass) {
    throw new GenerationQualityError(validation.summary, validation, repairCount);
  }

  return { candidate, validation, repairCount };
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```powershell
npx tsx --test tests/unit/generation-quality-gate.test.ts
npx tsc --noEmit
```

Expected: three tests pass and TypeScript exits `0`.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- lib/generation/quality-gate.ts tests/unit/generation-quality-gate.test.ts
git commit -m "feat: add generation quality gate"
```

---

### Task 5: AI Validator/Repair Adapters and SSE Integration

**Files:**
- Create: `lib/generation/tr4-quality-service.ts`
- Modify: `app/api/generate-ai-code-stream/route.ts`
- Modify: `app/generation/page.tsx`
- Test: `tests/unit/tr4-quality-service.test.ts`
- Test: `tests/generation-intent-ui.test.cjs`
- Test: `tests/generation-builder-ui.test.cjs`

**Interfaces:**
- Consumes: `GenerationValidationSchema`, `runGenerationQualityGate`, `resolveTeamModelRoute`, `resolveModelRoute`, and `getLanguageModel`.
- Produces: `reviewGeneratedCode(input): Promise<GenerationValidation>`.
- Produces: `repairGeneratedCode(input): Promise<string>`.
- Produces SSE events for `validating`, `repairing`, and `validation` before `complete`.

- [ ] **Step 1: Write failing adapter and integration tests**

Create `tests/unit/tr4-quality-service.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildRepairPrompt, buildReviewMessages } from "../../lib/generation/tr4-quality-service";

test("review prompt includes the brief and complete candidate", () => {
  const messages = buildReviewMessages({ prompt: "Build a newsroom", candidate: "<file path=\"src/App.jsx\">ok</file>" });
  assert.match(messages[1].content, /Build a newsroom/);
  assert.match(messages[1].content, /src\/App\.jsx/);
  assert.match(messages[0].content, /blocking/);
});

test("repair prompt preserves the XML file output contract", () => {
  const prompt = buildRepairPrompt({
    candidate: "<file path=\"src/App.jsx\">broken</file>",
    validation: {
      pass: false,
      summary: "broken",
      findings: [{ severity: "blocking", category: "correctness", file: "src/App.jsx", message: "broken", repairInstruction: "fix it" }],
    },
  });
  assert.match(prompt, /Return the complete corrected candidate/);
  assert.match(prompt, /<file path=/);
  assert.match(prompt, /fix it/);
});
```

Add to `tests/generation-intent-ui.test.cjs`:

```js
test('generation runs the QA gate before emitting complete', () => {
  assert.match(route, /runGenerationQualityGate/);
  assert.match(route, /resolveTeamModelRoute\("qa", qaModel\)/);
  assert.match(route, /resolveModelRoute\("repair"\)/);
  assert.match(route, /type: 'validation'/);
  assert.ok(route.indexOf('runGenerationQualityGate') < route.lastIndexOf("type: 'complete'"));
});
```

Add to `tests/generation-builder-ui.test.cjs`:

```js
test('builder surfaces validator and repair progress', () => {
  assert.match(source, /data\.type === 'validation'/);
  assert.match(source, /Quality gate passed/);
  assert.match(source, /repairCount/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npx tsx --test tests/unit/tr4-quality-service.test.ts
node --test tests/generation-intent-ui.test.cjs tests/generation-builder-ui.test.cjs
```

Expected: FAIL because the quality service and SSE integration do not exist.

- [ ] **Step 3: Implement review and repair adapters**

Create `lib/generation/tr4-quality-service.ts`:

```ts
import type { LanguageModel } from "ai";
import { generateObject, streamText } from "ai";
import {
  GenerationValidationSchema,
  type GenerationValidation,
} from "./quality-gate";

export function buildReviewMessages(input: { prompt: string; candidate: string }) {
  return [
    {
      role: "system" as const,
      content: "You are G Studio's blocking code validator. Mark pass=false for incomplete files, invalid imports, broken responsive behavior, missing focus states, non-tokenized design values, or fabricated metrics. Findings must be concrete and repairable.",
    },
    {
      role: "user" as const,
      content: `ORIGINAL BRIEF:\n${input.prompt}\n\nGENERATED CANDIDATE:\n${input.candidate}`,
    },
  ];
}

export function buildRepairPrompt(input: {
  candidate: string;
  validation: GenerationValidation;
}): string {
  const findings = input.validation.findings
    .map((finding) => `- ${finding.file ?? "project"}: ${finding.repairInstruction}`)
    .join("\n");

  return `Repair the generated candidate using every blocking instruction below.\n${findings}\n\nReturn the complete corrected candidate using the same <file path="...">...</file> XML contract. Do not return commentary or partial files.\n\nCANDIDATE:\n${input.candidate}`;
}

export async function reviewGeneratedCode(input: {
  model: LanguageModel;
  prompt: string;
  candidate: string;
}): Promise<GenerationValidation> {
  const result = await generateObject({
    model: input.model,
    schema: GenerationValidationSchema,
    messages: buildReviewMessages(input),
  });
  return result.object;
}

export async function repairGeneratedCode(input: {
  model: LanguageModel;
  candidate: string;
  validation: GenerationValidation;
}): Promise<string> {
  const result = await streamText({
    model: input.model,
    messages: [
      { role: "system", content: "You repair complete React/Vite generation artifacts without changing unrelated intent." },
      { role: "user", content: buildRepairPrompt(input) },
    ],
    maxTokens: 8192,
  });

  let repaired = "";
  for await (const chunk of result.textStream) repaired += chunk;
  if (!repaired.includes("<file path=\"") || !repaired.includes("</file>")) {
    throw new Error("TR4 repair model returned an invalid file artifact");
  }
  return repaired;
}
```

- [ ] **Step 4: Integrate the gate before the completion event**

In `app/api/generate-ai-code-stream/route.ts`, import:

```ts
import {
  GenerationQualityError,
  runGenerationQualityGate,
} from "@/lib/generation/quality-gate";
import {
  repairGeneratedCode,
  reviewGeneratedCode,
} from "@/lib/generation/tr4-quality-service";
```

After truncation recovery, before the `type: 'complete'` event, add:

```ts
const qaRoute = resolveTeamModelRoute("qa", qaModel);
const repairRoute = resolveModelRoute("repair");
const qaLanguageModel = getLanguageModel(qaRoute);
const repairLanguageModel = getLanguageModel(repairRoute);

const qualityResult = await runGenerationQualityGate({
  candidate: generatedCode,
  maxRepairs: 1,
  onStage: async (stage, repairCount) => {
    await sendProgress({
      type: "status",
      stage,
      repairCount,
      message: stage === "validating"
        ? "QA validator is reviewing the generated files..."
        : "Repair model is correcting blocking findings...",
    });
  },
  review: (candidate) => reviewGeneratedCode({
    model: qaLanguageModel,
    prompt,
    candidate,
  }),
  repair: (candidate, validation) => repairGeneratedCode({
    model: repairLanguageModel,
    candidate,
    validation,
  }),
});

generatedCode = qualityResult.candidate;
files.length = 0;
for (const match of generatedCode.matchAll(/<file path="([^"]+)">([\s\S]*?)<\/file>/g)) {
  files.push({ path: match[1], content: match[2] });
}
componentCount = files.filter((file) => file.path.includes("components/")).length;
await sendProgress({
  type: "validation",
  validation: qualityResult.validation,
  repairCount: qualityResult.repairCount,
  message: "Quality gate passed",
});
```

Add `validation` and `repairCount` to the final `complete` payload. In the outer stream catch, when the error is `GenerationQualityError`, send its findings in the error payload and do not emit `complete`.

- [ ] **Step 5: Surface QA progress in the builder**

In both SSE parsing loops in `app/generation/page.tsx`, add before the `complete` branch:

```ts
} else if (data.type === "validation") {
  setGenerationProgress((previous) => ({
    ...previous,
    status: data.repairCount > 0
      ? `Quality gate passed after ${data.repairCount} repair`
      : "Quality gate passed",
  }));
```

Keep terminal `error` handling unchanged so a second QA failure rolls back partial generation state and prevents `applyGeneratedCode`.

- [ ] **Step 6: Run focused QA tests and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/generation-quality-gate.test.ts tests/unit/tr4-quality-service.test.ts
node --test tests/generation-intent-ui.test.cjs tests/generation-builder-ui.test.cjs
npx tsc --noEmit
```

Expected: all focused tests pass and TypeScript exits `0`.

- [ ] **Step 7: Commit Task 5**

```powershell
git add -- lib/generation/tr4-quality-service.ts app/api/generate-ai-code-stream/route.ts app/generation/page.tsx tests/unit/tr4-quality-service.test.ts tests/generation-intent-ui.test.cjs tests/generation-builder-ui.test.cjs
git commit -m "feat: validate and repair generated code before apply"
```

---

### Task 6: End-to-End Verification and Handoff

**Files:**
- Modify only if verification exposes a scoped defect in the files changed by Tasks 1-5.
- Update: `docs/superpowers/plans/2026-07-13-tr4-role-routing-implementation.md` checkboxes during execution.

**Interfaces:**
- Verifies the complete TR4-only model and QA contract.

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
npm run test:all
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all legacy, unit, and integration tests pass; TypeScript and production build exit `0`; no whitespace errors.

- [ ] **Step 2: Verify active provider references**

Run:

```powershell
$matches = rg -n -i --glob '!tests/**' --glob '!docs/**' "OPENCODEGO|\bopencode\b|CLINE_API_KEY|api\.cline\.bot" app config lib
if ($LASTEXITCODE -eq 0) { $matches; exit 1 }
if ($LASTEXITCODE -ne 1) { exit $LASTEXITCODE }
```

Expected: no output and exit `0` after the explicit no-match handling.

- [ ] **Step 3: Verify TR4 model availability without exposing credentials**

Run a PowerShell request that reads `TR4_API_KEY` from `.env.local`, calls `https://api.tr4.net/v1/models`, and asserts the required IDs exist:

```powershell
$keyLine = Get-Content .env.local | Where-Object { $_ -match '^TR4_API_KEY=' } | Select-Object -First 1
$key = ($keyLine -replace '^TR4_API_KEY=', '').Trim().Trim('"')
$models = (Invoke-RestMethod -Uri 'https://api.tr4.net/v1/models' -Headers @{ Authorization = "Bearer $key" }).data.id
$required = @('gpt-5.6-terra','gpt-5.3-codex-spark','codex-auto-review','gpt-5.4-mini','gemini-3.1-pro-low','gemini-3.1-flash-image','gpt-5.6-sol')
$missing = $required | Where-Object { $_ -notin $models }
if ($missing) { throw "Missing TR4 models: $($missing -join ', ')" }
```

Expected: no output and exit `0`; the API key is never printed.

- [ ] **Step 4: Browser smoke test on the existing local server**

Verify these observable behaviors:

1. New-project model roles default to Terra, Codex Spark, and Codex Auto Review.
2. Builder settings expose only role-appropriate TR4 options.
3. A stale project with `kimi-k2.7-code` or `deepseek-v4-pro` visibly normalizes to the approved replacement.
4. Generation progress reaches Planning/Coding, QA validation, and optionally Repair.
5. Code is applied only after the `Quality gate passed` event.
6. Server logs contain TR4 model names and no OpenCode/Cline request.

- [ ] **Step 5: Close verification without a catch-all commit**

No extra commit is needed when Tasks 1-5 are clean. If verification exposes a defect, return to the task that owns that behavior, add a failing regression test there, apply the scoped fix, rerun that task's verification command, and use that task's explicit `git add` file list. Finish with a clean implementation diff except intentionally ignored local logs and browser artifacts.
