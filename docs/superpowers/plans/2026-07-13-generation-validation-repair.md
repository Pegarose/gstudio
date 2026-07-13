# Generation Validation and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce deterministic static, compile, runtime, responsive, accessibility, and visual quality gates before a generation can be reported as successful.

**Architecture:** Validation runs as a typed pipeline after sandbox apply. Hard-gate failures prevent success; eligible code/design failures receive one scoped repair using only implicated files and evidence. Source/output visual comparison combines screenshot evidence with DOM-derived structure, typography, color, and spacing metrics.

**Tech Stack:** TypeScript compiler API, Playwright Test 1.61.1, `@axe-core/playwright` 4.12.1, `pixelmatch` 7.2.0, `pngjs` 7.0.0, Zod, SandboxService.

## Global Constraints

- The model's self-reported gate score is observability data, not pass/fail authority.
- Compile, runtime, accessibility, and responsive checks are hard gates.
- Required widths are 320, 375, 414, 768, and one desktop width.
- No horizontal document overflow is allowed.
- Dynamic screenshot regions must be explicitly masked; never raise thresholds to hide deterministic regressions.
- Automated repair runs at most once.
- Infrastructure, secrets, policy, provider, and capture failures are not sent to the design repair model.

---

### Task 1: Define Validation Contracts and Static Rules

**Files:**
- Create: `lib/generation/contracts/validation.ts`
- Create: `lib/generation/validation/static-validator.ts`
- Create: `lib/generation/validation/rules.ts`
- Create: `tests/validation/static-validator.test.ts`
- Create: `tests/fixtures/validation/passing-files.ts`
- Create: `tests/fixtures/validation/failing-files.ts`

**Interfaces:**
- Consumes: `GenerationArtifact`, `ProductBrief`, `DesignPlan`.
- Produces: `ValidationReportSchema`, `RuleViolation`, and `validateStaticRules(input)`.

- [x] **Step 1: Write deterministic violation tests**

```ts
test("static validation detects multiple H1s, inline colors, and italic headings", () => {
  const report = validateStaticRules({ files: failingFiles, brief: briefFixture, plan: planFixture });
  assert.ok(report.some((item) => item.code === "multiple-h1"));
  assert.ok(report.some((item) => item.code === "inline-color"));
  assert.ok(report.some((item) => item.code === "italic-heading"));
});

test("invented proof is rejected when absent from supplied facts", () => {
  const violations = validateStaticRules({
    files: [{ path: "src/App.tsx", content: "<p>Trusted by 50,000 teams</p>" }],
    brief: { ...briefFixture, contentFacts: [] },
    plan: planFixture,
  });
  assert.ok(violations.some((item) => item.code === "invented-proof"));
});
```

- [x] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/validation/static-validator.test.ts
```

Expected: FAIL because validation modules do not exist.

- [x] **Step 3: Implement schemas and static validators**

Define `CheckResult`, `ResponsiveCheckResult`, `VisualEvaluation`, `RepairEligibility`, and `ValidationReport` as Zod schemas.

Use the TypeScript compiler API to traverse JSX opening elements and heading style/class attributes. Rules must report `{ code, severity, file, line, message, evidence }`.

Implement these first-pass rules:

- `multiple-h1`
- `missing-h1`
- `inline-color`
- `inline-font-family`
- `italic-heading`
- `unsafe-file-path`
- `duplicate-file-path`
- `undeclared-package`
- `invented-proof`
- `missing-focus-visible`
- `duplicate-primary-cta`

Invented proof checks numeric claims, `trusted by`, `customers`, `awards`, and testimonial quotation patterns against normalized `contentFacts` and allowed placeholders.

- [x] **Step 4: Run validation tests**

Run:

```powershell
npx tsx --test tests/validation/static-validator.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add lib/generation/contracts/validation.ts lib/generation/validation tests/validation tests/fixtures/validation
git commit -m "feat: add deterministic static quality rules"
```

### Task 2: Validate Dependencies and Sandbox Build

**Files:**
- Create: `lib/generation/validation/dependency-validator.ts`
- Create: `lib/generation/validation/build-validator.ts`
- Modify: `lib/generation/artifact/artifact-applier.ts`
- Create: `tests/validation/dependency-validator.test.ts`
- Create: `tests/integration/build-validator.test.ts`

**Interfaces:**
- Consumes: artifact packages/files and `SandboxService`.
- Produces: `validateDependencies`, `validateSandboxBuild`, and typed compile results.

- [x] **Step 1: Write package and compile tests**

```ts
test("dependency validation rejects commands and URLs", () => {
  assert.throws(() => validateDependencies(["react; rm -rf /", "https://example.com/pkg.tgz"]));
});

test("build validation preserves exact stderr evidence", async () => {
  const result = await validateSandboxBuild("sandbox-1", fakeSandbox({
    exitCode: 1,
    stderr: "src/App.tsx(4,1): error TS1005",
  }));
  assert.equal(result.passed, false);
  assert.match(result.evidence, /TS1005/);
});
```

- [x] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/validation/dependency-validator.test.ts tests/integration/build-validator.test.ts
```

Expected: FAIL because validators do not exist.

- [x] **Step 3: Implement dependency and build gates**

Allow only npm registry package names matching:

```ts
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i;
```

Compare bare imports extracted with the TypeScript compiler to declared packages plus the sandbox template dependencies. Install missing validated packages once. Run `npm run build` with a 120-second timeout and capture stdout/stderr/exit code.

Do not restart or overwrite the last working version when build fails.

- [x] **Step 4: Run focused tests**

Run:

```powershell
npx tsx --test tests/validation/dependency-validator.test.ts tests/integration/build-validator.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add lib/generation/validation/dependency-validator.ts lib/generation/validation/build-validator.ts lib/generation/artifact/artifact-applier.ts tests/validation/dependency-validator.test.ts tests/integration/build-validator.test.ts
git commit -m "feat: validate dependencies and sandbox builds"
```

### Task 3: Add Responsive Runtime and Accessibility Validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/generation/validation/browser-validator.ts`
- Create: `lib/generation/validation/browser-script.ts`
- Create: `tests/validation/browser-validator.test.ts`
- Create: `tests/fixtures/sites/overflow/index.html`
- Create: `tests/fixtures/sites/passing/index.html`

**Interfaces:**
- Consumes: ready sandbox URL and viewport list.
- Produces: runtime, responsive, keyboard, reduced-motion, and Axe check results.

- [x] **Step 1: Write controlled-site validation tests**

```ts
test("browser validator detects horizontal overflow at 320px", async () => {
  const report = await validateBrowser({ url: overflowFixtureUrl, desktopWidth: 1440 });
  const mobile = report.responsive.find((item) => item.width === 320);
  assert.equal(mobile?.horizontalOverflow, true);
});

test("browser validator captures page errors", async () => {
  const report = await validateBrowser({ url: runtimeErrorFixtureUrl, desktopWidth: 1440 });
  assert.ok(report.runtime.evidence.includes("fixture runtime error"));
});
```

- [x] **Step 2: Install browser test dependencies and verify failure**

Run:

```powershell
npm install --save-dev @playwright/test@1.61.1 @axe-core/playwright@4.12.1
npx playwright install chromium
npx tsx --test tests/validation/browser-validator.test.ts
```

Expected: FAIL because the browser validator does not exist.

- [x] **Step 3: Implement browser hard gates**

For widths `[320, 375, 414, 768, desktopWidth]`:

```ts
await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const dimensions = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
```

Collect `console` errors and `pageerror` events. Tab through interactive elements and verify focus is visible by comparing computed outline/box-shadow/border changes. Emulate reduced motion and assert no infinite animation remains on primary content.

Run Axe:

```ts
const axe = await new AxeBuilder({ page }).analyze();
```

Treat serious and critical Axe violations as hard failures. Persist node selectors and help URLs as evidence.

- [x] **Step 4: Run browser tests**

Run:

```powershell
npx tsx --test tests/validation/browser-validator.test.ts
```

Expected: PASS; the overflow fixture fails validation for the expected width while the passing fixture passes.

- [x] **Step 5: Commit**

```powershell
git add package.json package-lock.json lib/generation/validation/browser-validator.ts lib/generation/validation/browser-script.ts tests/validation/browser-validator.test.ts tests/fixtures/sites
git commit -m "feat: validate runtime accessibility and responsiveness"
```

### Task 4: Add Visual and Structural Comparison

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/generation/validation/visual-evaluator.ts`
- Create: `lib/generation/validation/layout-comparator.ts`
- Create: `lib/generation/validation/image-comparator.ts`
- Create: `tests/validation/visual-evaluator.test.ts`
- Create: `tests/fixtures/visual/`

**Interfaces:**
- Consumes: source `ReferenceBundle`, output screenshots, source/output layout evidence.
- Produces: separate structural, typography, color, spacing, responsive, and screenshot-diff scores.

- [x] **Step 1: Write per-axis comparison tests**

```ts
test("typography mismatch does not hide behind a good screenshot score", async () => {
  const result = await evaluateVisualFidelity({
    source: sourceFixture,
    output: { ...outputFixture, typography: [{ role: "h1", size: 32 }] },
  });
  assert.ok(result.screenshot >= 0.8);
  assert.ok(result.typography < 0.6);
});
```

- [x] **Step 2: Install image comparison dependencies and verify failure**

Run:

```powershell
npm install --save-dev pixelmatch@7.2.0 pngjs@7.0.0
npx tsx --test tests/validation/visual-evaluator.test.ts
```

Expected: FAIL because the evaluator does not exist.

- [x] **Step 3: Implement separate visual axes**

Use normalized landmark order and relative bounding boxes for structure. Compare font role, size ratio, weight, and line-height for typography. Compare token/color histograms for color and normalized gaps/padding for spacing.

For screenshot evidence:

```ts
const mismatchedPixels = pixelmatch(source.data, output.data, diff.data, width, height, { threshold: 0.1 });
const screenshotScore = 1 - mismatchedPixels / (width * height);
```

Resize only when source and output target the same viewport but differ by device-pixel ratio. Do not stretch different aspect ratios into a match. Store diff images as artifacts.

- [x] **Step 4: Run visual tests**

Run:

```powershell
npx tsx --test tests/validation/visual-evaluator.test.ts
```

Expected: PASS with independently asserted axis scores.

- [x] **Step 5: Commit**

```powershell
git add package.json package-lock.json lib/generation/validation/visual-evaluator.ts lib/generation/validation/layout-comparator.ts lib/generation/validation/image-comparator.ts tests/validation/visual-evaluator.test.ts tests/fixtures/visual
git commit -m "feat: score visual fidelity by evidence axis"
```

### Task 5: Orchestrate and Persist Validation Reports

**Files:**
- Create: `lib/generation/validation/validation-runner.ts`
- Modify: `lib/generation/orchestration/generation-orchestrator.ts`
- Modify: `lib/generation/repository.ts`
- Create: `tests/integration/validation-runner.test.ts`

**Interfaces:**
- Consumes: artifact, brief, plan, sandbox URL, optional reference bundle.
- Produces: one persisted `ValidationReport` and `RepairEligibility`.

- [ ] **Step 1: Write hard-gate aggregation tests**

```ts
test("a runtime failure keeps final status failed even when visual scores pass", async () => {
  const report = await runValidation(validationFixture({ runtimePassed: false, visualScore: 0.98 }));
  assert.equal(report.finalStatus, "failed");
  assert.equal(report.repairEligibility.eligible, true);
});

test("policy failures are not repair eligible", async () => {
  const report = await runValidation(validationFixture({ failureClass: "capture-policy" }));
  assert.equal(report.repairEligibility.eligible, false);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/validation-runner.test.ts
```

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement ordered validation**

Order:

1. Static rules.
2. Dependency validation.
3. Build.
4. Runtime/responsive/accessibility.
5. Output screenshot capture.
6. Mode-specific visual evaluation.

Skip downstream browser work after a build failure. Persist partial reports with skipped reasons. Inspiration mode records brand-language metrics without clone structure thresholds. Scratch mode records originality and honesty rules without source screenshot scoring.

- [ ] **Step 4: Run tests**

Run:

```powershell
npx tsx --test tests/integration/validation-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/validation/validation-runner.ts lib/generation/orchestration/generation-orchestrator.ts lib/generation/repository.ts tests/integration/validation-runner.test.ts
git commit -m "feat: persist deterministic validation reports"
```

### Task 6: Implement One Targeted Repair Cycle

**Files:**
- Create: `lib/generation/repair/repair-context.ts`
- Create: `lib/generation/repair/repair-generator.ts`
- Create: `lib/generation/repair/repair-policy.ts`
- Modify: `lib/generation/orchestration/generation-orchestrator.ts`
- Create: `tests/integration/repair-cycle.test.ts`

**Interfaces:**
- Consumes: failed report, original plan, implicated files, repair model route.
- Produces: one `GenerationArtifact` patch and final re-validation.

- [ ] **Step 1: Write repair-limit and scope tests**

```ts
test("repair receives only implicated files", () => {
  const context = buildRepairContext({
    report: overflowFailure("src/App.tsx"),
    files: artifactFixture.files,
    plan: planFixture,
  });
  assert.deepEqual(context.files.map((file) => file.path), ["src/App.tsx", "src/index.css"]);
});

test("second automatic repair is forbidden", async () => {
  await assert.rejects(() => runRepair({ generation: { repairCount: 1 } as never }), /repair limit/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npx tsx --test tests/integration/repair-cycle.test.ts
```

Expected: FAIL because repair modules do not exist.

- [ ] **Step 3: Implement scoped repair**

Eligible classes are `static-rule`, `dependency`, `compile`, `runtime`, `responsive`, `accessibility`, and `visual-fidelity`. Ineligible classes are `capture-policy`, `provider-unavailable`, `secret-missing`, `sandbox-infrastructure`, and `user-input`.

The repair prompt includes:

- Original validated design plan.
- Exact failed checks and evidence.
- Implicated files plus direct CSS/component dependencies.
- Explicit instruction not to delete planned functionality.

Generate a structured artifact patch, validate it, apply it, increment `repair_count` transactionally, and run the full validation pipeline once more. Never call repair when `repair_count >= 1`.

- [ ] **Step 4: Run repair tests**

Run:

```powershell
npx tsx --test tests/integration/repair-cycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/generation/repair lib/generation/orchestration/generation-orchestrator.ts tests/integration/repair-cycle.test.ts
git commit -m "feat: add one targeted generation repair"
```

### Task 7: Add Playwright Release Configuration and Quality Fixtures

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/quality-gates.spec.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/screenshot-mask.css`
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: local Next.js server and fixture routes.
- Produces: repeatable responsive and screenshot release checks.

- [ ] **Step 1: Write a failing E2E quality test**

```ts
import path from "node:path";

test("passing fixture is stable at mobile and desktop", async ({ page }) => {
  await page.goto("/test-fixtures/passing");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("passing.png", {
    fullPage: true,
    animations: "disabled",
    stylePath: path.resolve("tests/e2e/screenshot-mask.css"),
    maxDiffPixelRatio: 0.01,
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm run test:e2e -- quality-gates.spec.ts
```

Expected: FAIL because Playwright configuration and fixture route do not exist.

- [ ] **Step 3: Configure stable browser projects**

Define Chromium projects for 320, 375, 414, 768, and 1440 widths. Configure `webServer` with `npm run dev`, base URL `http://127.0.0.1:9010`, trace on first retry, and screenshot output under ignored `test-results/`.

Ignore `playwright-report/**` and `test-results/**` in Git and ESLint. Mask timestamps, random IDs, and sandbox URLs with the style sheet rather than broad screenshot thresholds.

- [ ] **Step 4: Run Wave 4 verification**

Run:

```powershell
npm run test:validation
npm run test:e2e -- quality-gates.spec.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add playwright.config.ts tests/e2e .gitignore eslint.config.mjs
git commit -m "test: add browser quality release gates"
```

## Wave 4 Completion Check

Run:

```powershell
npm run test:validation
npm run test:e2e
```

Expected: deterministic bad fixtures fail for their expected codes, passing fixtures pass, and no generation with a hard-gate failure has terminal status `passed`.
