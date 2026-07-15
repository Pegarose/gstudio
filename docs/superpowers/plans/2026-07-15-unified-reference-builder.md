# Unified Reference Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the primary Clone/Inspiration/Scratch launcher with one brief-plus-optional-reference flow and make E2B/browser validation reliable enough for scratch and URL-reference builds.

**Architecture:** New execution intents are `scratch` and `inspire`; legacy `clone` is normalized to `inspire`. The UI exposes one OmniRoute Builder model while hidden planning, QA, repair, and deterministic validators remain intact. Reliability fixes land at the validator and sandbox seams before the launcher changes.

**Tech Stack:** Next.js 15, React/TypeScript, Tailwind, OmniRoute Chat Completions, E2B, Firecrawl, PostgreSQL, Redis, Node test runner, `tsx`, Playwright.

## Global Constraints

- URL work is original inspiration/reference by default, never the primary exact-clone workflow.
- `candidate-ready` is intermediate; only live apply terminal `complete` is success.
- Keep static, build, browser, accessibility, and rollback validation enabled.
- Accept `var(--token)` references; reject literal inline colors and un-tokenized font families.
- Never log or commit provider credentials.
- Preserve existing projects, legacy `clone` records, database model columns, and unrelated local changes.

## File Map

- `lib/generation-intent.js`: intent normalization.
- `app/page.tsx`: unified launcher and Advanced model controls.
- `app/generation/page.tsx`: session compatibility and normalized reference context.
- `lib/generation/validation/source-normalizer.ts`: zero-width and ESM safety normalization.
- `lib/generation/validation/static-validator.ts`: token-aware inline style checks.
- `lib/generation/validation/browser-script.ts` and `browser-validator.ts`: typed browser infrastructure failures.
- `lib/sandbox/providers/e2b-provider.ts`: bounded provisioning retry/readiness.
- `app/api/create-ai-sandbox-v2/route.ts`: typed sandbox errors.
- `tests/generation-intent-ui.test.cjs`, `tests/generation-builder-ui.test.cjs`, `tests/validation/static-validator.test.ts`, `tests/validation/browser-validator.test.ts`, `tests/unit/e2b-provider.test.ts`: regression coverage.
- `tests/smoke/reference-builder-smoke.test.cjs`: three scenario smoke harness.

---

### Task 1: Normalize the intent contract

**Files:** `lib/generation-intent.js`, `app/page.tsx`, `app/generation/page.tsx`, `tests/generation-intent-ui.test.cjs`, `tests/generation-builder-ui.test.cjs`.

**Interfaces:** `resolveGenerationIntent({ explicitIntent, instructions, url })` returns `scratch` or `inspire` for new execution; `clone` remains accepted only as a legacy input.

- [ ] **Step 1: Write failing tests.** Assert that no URL resolves to `scratch`, a URL resolves to `inspire`, `scratch://` resolves to `scratch`, and explicit/legacy `clone` resolves to `inspire`. Assert new launcher storage uses only `scratch`/`inspire`.
- [ ] **Step 2: Run `npm run test:legacy -- --test-name-pattern="project launcher|reference intent|builder routes inspiration"`; confirm failure.**
- [ ] **Step 3: Implement resolver.** Use `scratch` for `scratch://`; return `inspire` for explicit `inspire` or `clone`, inspiration language, clone language, or any non-empty URL; otherwise return `scratch`. Normalize legacy session values in the builder before generation.
- [ ] **Step 4: Run the focused tests and `npx tsc --noEmit`; confirm pass.**
- [ ] **Step 5: Commit:** `git add lib/generation-intent.js app/page.tsx app/generation/page.tsx tests/generation-intent-ui.test.cjs tests/generation-builder-ui.test.cjs && git commit -m "feat: normalize reference builder intents"`.

### Task 2: Replace the primary launcher with an optional-reference form

**Files:** `app/page.tsx`, `tests/generation-intent-ui.test.cjs`, and `tests/dashboard-projects-ui.test.cjs` only if labels change.

**Interfaces:** The launcher produces project name, brief, optional `referenceUrl`, and Advanced model settings; it writes `generationIntent` as `scratch` or `inspire` and keeps `targetUrl` as a compatibility alias.

- [ ] **Step 1: Write failing UI assertions.** Require optional reference copy, one primary launch path, Advanced model controls, no primary `Clone Website` label, and correct storage for URL/no-URL submissions.
- [ ] **Step 2: Run `npm run test:legacy -- --test-name-pattern="project launcher exposes|generation intent"`; confirm failure.**
- [ ] **Step 3: Implement the form.** Replace the primary tab state with `referenceUrl` and `useReference`; enable the reference toggle when a valid URL is entered; keep model selectors behind an Advanced disclosure; explain that URLs provide visual language only.
- [ ] **Step 4: Use Playwright CLI on `http://localhost:9010/` to verify the optional URL, Advanced disclosure, and session payload without launching a generation.**
- [ ] **Step 5: Run focused tests and `npx tsc --noEmit`; commit with `git add app/page.tsx tests/generation-intent-ui.test.cjs tests/dashboard-projects-ui.test.cjs && git commit -m "feat: simplify reference builder launcher"`.

### Task 3: Normalize generated source and make token validation compatible

**Files:** create `lib/generation/validation/source-normalizer.ts`; modify `lib/generation/validation/static-validator.ts` and its quality-gate entry seam; test `tests/validation/static-validator.test.ts` and create `tests/unit/generation-source-normalizer.test.ts`.

**Interfaces:** `normalizeGeneratedSource(files)` returns normalized files plus findings. Static validation consumes normalized files and allows token references.

- [ ] **Step 1: Write failing tests.** Cover zero-width removal, an ESM `require('react')` blocking finding, acceptance of `style={{ color: 'var(--color-text-primary)' }}`, and rejection of literal `style={{ color: '#fff' }}`.
- [ ] **Step 2: Run `npx tsx --test tests/validation/static-validator.test.ts tests/unit/generation-source-normalizer.test.ts`; confirm failure.**
- [ ] **Step 3: Implement normalization.** Remove only zero-width formatting characters; record ESM `require()` as a finding; preserve normal Unicode. Update inline style inspection to evaluate values, allowing `var(--...)` for color/font-family while continuing to reject literal values and arbitrary Tailwind colors/fonts.
- [ ] **Step 4: Run the focused tests and `npm run test:unit`; confirm pass.**
- [ ] **Step 5: Commit with `git add lib/generation/validation/source-normalizer.ts lib/generation/validation/static-validator.ts tests/validation/static-validator.test.ts tests/unit/generation-source-normalizer.test.ts && git commit -m "fix: normalize generated source before quality validation"`.

### Task 4: Make browser validation and E2B provisioning reliable

**Files:** `lib/generation/validation/browser-script.ts`, `lib/generation/validation/browser-validator.ts`, `lib/sandbox/providers/e2b-provider.ts`, `app/api/create-ai-sandbox-v2/route.ts`, `tests/validation/browser-validator.test.ts`, `tests/unit/e2b-provider.test.ts`.

**Interfaces:** Browser validation reports a typed `sandbox-infrastructure` failure when Chromium is unavailable. E2B retries only bounded transient provisioning errors and cleans up before retry.

- [ ] **Step 1: Write failing tests.** Add a missing-executable browser runner test and E2B tests for one retry after `fetch failed`, no retry after non-transient errors, and cleanup before retry.
- [ ] **Step 2: Run `npx tsx --test tests/validation/browser-validator.test.ts tests/unit/e2b-provider.test.ts`; confirm failure.**
- [ ] **Step 3: Implement browser classification.** Wrap `chromium.launch`; return a report with `failureClass: 'sandbox-infrastructure'` and safe executable evidence instead of throwing an unclassified error.
- [ ] **Step 4: Implement E2B retry/readiness.** Add at most two attempts around create/setup, bounded exponential delay below route timeout, cleanup between attempts, and a readiness command that checks the preinstalled Chromium path. Do not install Chromium per generation.
- [ ] **Step 5: Update `/api/create-ai-sandbox-v2` to return safe `errorClass` values without provider credentials.**
- [ ] **Step 6: Run focused tests, `npx tsc --noEmit`, and commit with `git add lib/generation/validation/browser-script.ts lib/generation/validation/browser-validator.ts lib/sandbox/providers/e2b-provider.ts app/api/create-ai-sandbox-v2/route.ts tests/validation/browser-validator.test.ts tests/unit/e2b-provider.test.ts && git commit -m "fix: classify browser and retry E2B infrastructure failures"`.

### Task 5: Align builder progress and failure copy

**Files:** `app/generation/page.tsx`, optionally `components/generation/GenerationProgressSurface.tsx`, `tests/generation-builder-ui.test.cjs`.

**Interfaces:** The builder consumes normalized intents and typed failures and produces one actionable message without reporting success on `candidate-ready`.

- [ ] **Step 1: Write failing assertions.** Inspiration copy must say visual reference/original build; scratch copy must not mention cloning; infrastructure errors must expose retry language; candidate-ready and apply complete must remain distinct.
- [ ] **Step 2: Map legacy clone to inspiration copy, map `sandbox-infrastructure` to Retry sandbox, and map static/browser/model-quality failures to specific next actions. Preserve rollback behavior.**
- [ ] **Step 3: Run `npm run test:legacy -- --test-name-pattern="builder|generation"` and `npx tsc --noEmit`; commit with `git add app/generation/page.tsx components/generation/GenerationProgressSurface.tsx tests/generation-builder-ui.test.cjs && git commit -m "feat: show truthful reference builder progress states"`.

### Task 6: Add smoke coverage and run the release gate

**Files:** create `tests/smoke/reference-builder-smoke.test.cjs`; modify `package.json` only if a stable `test:smoke` script is needed; update `handoff/done.md` only after successful smoke.

**Interfaces:** The harness creates temporary projects, captures normalized intent, asserts `candidate-ready` then apply `complete`, verifies preview content, and cleans all resources in `finally`.

- [ ] **Step 1: Write the harness for scratch, scratch-plus-reference, and inspiration.** Fail on generic Processing timeouts or unclassified infrastructure errors; always delete project and sandbox.
- [ ] **Step 2: Run `npm run test:smoke` against the rebuilt Docker stack; expected result is three `candidate-ready → validation → complete` sequences.**
- [ ] **Step 3: Run `npm run test:all`, `npm run test:validation`, `npx tsc --noEmit`, `npm run build`, `docker compose up -d --build`, and `docker compose ps`.**
- [ ] **Step 4: Verify cleanup with `docker compose exec -T db psql -U lovable_user -d open_lovable -c "SELECT id,name FROM projects WHERE name LIKE 'Smoke %';"`; expect no rows.**
- [ ] **Step 5: Commit the harness and evidence with `git add tests/smoke/reference-builder-smoke.test.cjs package.json handoff/done.md && git commit -m "test: add unified reference builder smoke coverage"`.

## Self-review checklist

- [ ] Every spec goal maps to a task.
- [ ] No task weakens deterministic validation or the candidate/complete contract.
- [ ] Function names and return types are defined before later tasks consume them.
- [ ] Every task has failing test, implementation, verification, and commit steps.
- [ ] Smoke cleanup is mandatory even when a scenario fails.
