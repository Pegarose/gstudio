# Generation Progress Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the G Studio builder a truthful, premium progress surface while a generation is captured, planned, built, applied, or validated.

**Architecture:** A new presentational component owns only the visual rail, accessible status semantics, and reduced-motion-safe decoration. The builder maps its current state into the component; the live apply activation flow retains ownership of success and failure state.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, Tailwind CSS, Node test runner with `tsx`.

## Global Constraints

- Preserve the existing G Studio orange, Geist/Inter font stack, Tailwind light/dark utility system, and existing motion dependencies.
- No raw inline color values, fake browser/device chrome, invented file counts, duration estimates, or quality claims.
- The component is presentational: it must not allocate a sandbox, call an API, or mutate generation state.
- Use `role="status"`, `aria-live="polite"`, and an accessible progressbar; continuous motion must stop under reduced motion.
- Verify responsive behavior at 320, 375, 414, and 768 CSS pixels with no horizontal overflow.
- Candidate-ready is not terminal success; only the apply flow may display terminal completion after live validation passes.
- Do not delete production files or modify unrelated page structures.

---

### Task 1: Build the presentational progress surface

**Files:**
- Create: `components/generation/GenerationProgressSurface.tsx`
- Create: `tests/unit/generation-progress-surface.test.tsx`

**Interfaces:**
- Produces `GenerationProgressPhase` and `GenerationProgressSurface`.
- Consumes only `phase`, `status`, optional `detail`, and optional `targetLabel` from its parent.

- [x] **Step 1: Write the failing component tests**

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerationProgressSurface } from "../../components/generation/GenerationProgressSurface";

test("renders an accessible active build stage without a terminal claim", () => {
  const markup = renderToStaticMarkup(
    <GenerationProgressSurface
      phase="build"
      status="Writing React components"
      detail="Preparing the candidate for application"
      targetLabel="businesswire.com"
    />,
  );

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /role="progressbar"/);
  assert.match(markup, /Writing React components/);
  assert.match(markup, /Workspace/);
  assert.match(markup, /Verify/);
  assert.doesNotMatch(markup, /Generation complete/i);
});

test("exposes all phases and maps verify to the terminal rail position", () => {
  const markup = renderToStaticMarkup(
    <GenerationProgressSurface phase="verify" status="Running quality checks" />,
  );

  assert.match(markup, /aria-valuenow="100"/);
  assert.match(markup, /data-phase="verify"/);
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npx tsx --test tests/unit/generation-progress-surface.test.tsx`

Expected: FAIL because `GenerationProgressSurface` does not exist.

- [x] **Step 3: Implement the minimal surface**

```tsx
export type GenerationProgressPhase =
  | "workspace"
  | "understand"
  | "plan"
  | "build"
  | "apply"
  | "verify";

export function GenerationProgressSurface({
  phase,
  status,
  detail,
  targetLabel,
}: GenerationProgressSurfaceProps) {
  // Render a real status region, a six-position stage rail, and the
  // CSS-only decorative mark. The element with role="progressbar" uses the
  // phase index to expose a deterministic, non-time-based value.
}
```

Use existing Tailwind semantic color utilities. Use a single `motion-reduce:animate-none` treatment for the CSS-only mark and active rail. Keep every visible copy string in the component's stage array or props; no API or state hooks are permitted.

- [x] **Step 4: Run focused verification and TypeScript**

Run:

```powershell
npx tsx --test tests/unit/generation-progress-surface.test.tsx
npx tsc --noEmit
git diff --check
```

Expected: both checks pass and the diff is clean.

- [x] **Step 5: Commit**

```powershell
git add components/generation/GenerationProgressSurface.tsx tests/unit/generation-progress-surface.test.tsx
git commit -m "feat: add generation progress surface"
```

**Completed:** `96c0a21 feat: add generation progress surface` — focused component tests (2/2), TypeScript, and task review passed.

---

### Task 2: Wire the surface to real builder state after the live apply gate

**Files:**
- Modify: `app/generation/page.tsx`
- Modify: `tests/generation-builder-ui.test.cjs`

**Interfaces:**
- Consumes `GenerationProgressSurface` from Task 1.
- Uses existing `loadingStage`, `isCapturingScreenshot`, `isPreparingDesign`, `generationProgress`, and `codeApplicationState` state only.
- Depends on `docs/superpowers/plans/2026-07-14-live-generation-validation-activation.md` Task 3, which changes candidate completion into `candidate-ready` and makes apply completion authoritative.

- [ ] **Step 1: Write failing builder contract tests**

```js
assert.match(source, /GenerationProgressSurface/);
assert.match(source, /phase=\{.*generationProgress|phase=\{.*loadingStage/s);
assert.match(source, /candidate-ready/);
assert.match(source, /validation-report/);
assert.doesNotMatch(source, /addChatMessage\('AI recreation generated!', 'system'\)[\s\S]{0,200}await applyGeneratedCode/);
```

The final assertion ensures a terminal success chat entry is not added before the authoritative apply path resolves.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/generation-builder-ui.test.cjs`

Expected: FAIL because the builder does not yet render the progress surface or use the new terminal event contract.

- [ ] **Step 3: Integrate after live activation is available**

```tsx
<GenerationProgressSurface
  phase={toGenerationProgressPhase({
    loadingStage,
    isCapturingScreenshot,
    isPreparingDesign,
    generationProgress,
    codeApplicationState,
  })}
  status={generationProgress.status || loadingStatus}
  detail={generationDetail}
  targetLabel={targetUrl || homeUrlInput || undefined}
/>
```

Create a small local mapping helper in `app/generation/page.tsx`; it must map only existing state and must not own network calls. Replace the current dark screenshot-overlay skeleton and the generic inline generated-file spinner only while an operation is active. Keep the existing screenshot when available as a subdued background, never as fake chrome. When the apply stream emits `validation-started` or `validation-report`, map to `verify`; when it emits `complete`, remove the surface and render the existing success state. When it emits `error`, remove the surface and preserve the previous preview as required by the live activation plan.

- [ ] **Step 4: Run targeted and type verification**

Run:

```powershell
node --test tests/generation-builder-ui.test.cjs tests/brand-guidelines.test.cjs
npx tsc --noEmit
git diff --check
```

Expected: all tests pass and the builder source keeps candidate and terminal events separate.

- [ ] **Step 5: Commit**

```powershell
git add app/generation/page.tsx tests/generation-builder-ui.test.cjs
git commit -m "feat: show live generation progress in builder"
```
