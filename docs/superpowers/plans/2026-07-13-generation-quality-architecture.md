# G Studio Generation Quality Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a durable, multimodal, mode-aware generation pipeline that can clone public websites with measured fidelity and generate premium original websites from scratch.

**Architecture:** Implement the approved design as five ordered, independently releasable waves. Each wave has its own detailed execution plan and release gate; no wave may depend on process-global sandbox or conversation state introduced by a previous route.

**Tech Stack:** Next.js 15.4.3, React 19.1, TypeScript 5, PostgreSQL 16, Redis 7, AI SDK 5, Zod 3.25, E2B, Vercel Sandbox, Firecrawl v2, Crawlee 3.17.0, CloakBrowser 0.4.10, Scrapling 0.4.11, Playwright 1.61.1.

## Global Constraints

- `gstudio-agent-context` remains the only canonical source for the core system prompt and design skills.
- Preserve all pre-existing user changes; the current dirty worktree must be committed or safely ported before implementation begins in an isolated `codex/` worktree.
- Clone, inspiration, and scratch remain distinct modes with distinct plans and evaluation profiles.
- Every generation operation uses explicit `projectId`, `generationId`, and `sandboxId`; never add a new `global.activeSandbox`, `global.sandboxState`, or `global.conversationState` dependency.
- Firecrawl v2 remains the default managed capture provider.
- Crawlee 3.17.0 is the self-hosted capture provider; Playwright is its default browser engine.
- CloakBrowser 0.4.10 is a bounded, typed-block-signal escalation under Crawlee, never an always-on scraper.
- Scrapling 0.4.11 runs only in a version-pinned internal Python sidecar and never relies on the developer machine's global package.
- Do not bypass authentication, authorization, paywalls, access controls, or interactive CAPTCHA challenges.
- A generation is successful only after compile, runtime, responsive, and accessibility hard gates pass.
- Automated repair is limited to one targeted cycle and must preserve intended functionality.
- Every task uses test-first red-green-refactor and ends with a focused commit.

---

## Program File Map

| Wave | Detailed plan | Independently testable deliverable |
| --- | --- | --- |
| 1 | [Generation Reliability Foundation](./2026-07-13-generation-reliability-foundation.md) | Durable generations, Redis coordination, reconnectable sandbox service, explicit IDs |
| 2 | [Structured Generation Pipeline](./2026-07-13-structured-generation-pipeline.md) | Capability-based model routing, typed plans/artifacts, staged orchestration |
| 3 | [Multi-Provider Reference Capture](./2026-07-13-multi-provider-reference-capture.md) | Firecrawl v2, Crawlee, CloakBrowser escalation, Scrapling adaptive sidecar |
| 4 | [Generation Validation and Repair](./2026-07-13-generation-validation-repair.md) | Static, browser, accessibility, visual gates and one targeted repair |
| 5 | [Builder Integration and Rollout](./2026-07-13-builder-rollout.md) | Decomposed builder client, generation timeline, E2E benchmark, legacy removal |

## Ordered Release Gates

### Gate 0: Protect the Existing Baseline

- [ ] Record `git status --short`, current test results, TypeScript result, and Docker service status in the execution log.
- [ ] Preserve or commit the current canonical-context and builder changes before creating an implementation worktree.
- [ ] Create a branch with the `codex/` prefix from the preserved baseline.

Run:

```powershell
git status --short
node --test tests/*.test.cjs
npx tsc --noEmit
docker compose ps
```

Expected: the known baseline results are recorded; no existing change is silently discarded.

### Gate 1: Reliability Foundation

- [ ] Complete every task in `2026-07-13-generation-reliability-foundation.md`.
- [ ] Verify two project-scoped sandbox leases do not share state.
- [ ] Verify E2B reconnect and readiness do not use fixed startup sleeps.
- [ ] Verify new generation routes accept explicit IDs.

Run:

```powershell
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: all commands exit `0`; a restart-safe generation record and sandbox lease can be recovered by ID.

### Gate 2: Structured Generation

- [ ] Complete every task in `2026-07-13-structured-generation-pipeline.md`.
- [ ] Verify clone, inspiration, scratch, and edit requests produce distinct typed plans.
- [ ] Verify malformed model output cannot reach sandbox application.
- [ ] Verify provider fallbacks preserve the same Zod output contract.

Run:

```powershell
npm run test:unit
npm run test:integration
npx tsc --noEmit
```

Expected: structured fixtures pass and the legacy XML parser is no longer used by the new generation endpoint.

### Gate 3: Reference Capture

- [ ] Complete every task in `2026-07-13-multi-provider-reference-capture.md`.
- [ ] Verify Firecrawl remains the default path.
- [ ] Verify Crawlee uses standard Playwright before CloakBrowser.
- [ ] Verify CloakBrowser escalation occurs once only after a typed block signal.
- [ ] Verify Scrapling adaptive re-capture is isolated behind its internal service.

Run:

```powershell
npm run test:reference
docker compose build capture-worker scrapling-worker
docker compose run --rm scrapling-worker pytest -q
```

Expected: all fixture captures normalize to one `ReferenceBundle`; policy fixtures stop at auth/paywall/CAPTCHA boundaries.

### Gate 4: Validation and Repair

- [ ] Complete every task in `2026-07-13-generation-validation-repair.md`.
- [ ] Verify static, compile, runtime, responsive, accessibility, and visual reports are persisted.
- [ ] Verify a failing generation receives at most one repair.
- [ ] Verify hard-gate failures cannot be presented as successful.

Run:

```powershell
npm run test:validation
npm run test:e2e
```

Expected: deterministic failure fixtures fail for the expected reason; passing fixtures produce a persisted `ValidationReport`.

### Gate 5: Builder and Rollout

- [ ] Complete every task in `2026-07-13-builder-rollout.md`.
- [ ] Verify the builder displays durable generation stages after reload.
- [ ] Verify project switching cannot leak sandbox or chat state.
- [ ] Verify the 30-case benchmark records per-mode and per-provider outcomes.
- [ ] Remove legacy routes and globals only after consumer-count tests report zero.

Run:

```powershell
npm run test:all
npm run build
```

Expected: all commands exit `0`; clone, inspiration, scratch, edit, reload, restore, and project-switch E2E flows pass.

## Program Completion Definition

The program is complete only when:

1. All five detailed plans are complete.
2. `rg -n "global\.(activeSandbox|activeSandboxProvider|sandboxState|conversationState)" app lib` returns no runtime consumers.
3. The new capture router records provider, engine, reason, latency, outcome, confidence, escalation count, and cost class.
4. Clone planning receives desktop and mobile screenshots as image parts.
5. Structured artifacts pass Zod validation before apply.
6. Browser hard gates pass before success is reported.
7. One failed repair cannot trigger a second automatic repair.
8. The 30-case benchmark report is stored as a build artifact and generation metrics are queryable from PostgreSQL.

## Program-Level Commit Order

```text
test: establish generation architecture harness
feat: persist generation jobs and sandbox leases
refactor: route sandbox operations through durable service
feat: add capability-based model routing
feat: stream structured generation artifacts
feat: add multimodal reference capture contract
feat: add resilient capture providers
feat: enforce deterministic generation quality gates
refactor: integrate durable generation state into builder
test: add generation benchmark and release suite
chore: remove legacy generation and sandbox state
```
