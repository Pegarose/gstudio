# Live Generation Validation Activation Design

## Decision

Approved by the user on 2026-07-14:

1. Activate the deterministic validation and one targeted repair pipeline in the live builder path.
2. Use zero screenshot-difference tolerance outside explicitly declared dynamic masks.

The active TR4 LLM QA gate remains in place. Deterministic validation is an additional, authoritative post-apply gate; it does not replace the existing prompt/QA layer.

## Problem

The generation stream currently emits its `complete` event before the client applies code to the sandbox. The new static, dependency, build, browser, visual, report-persistence, and scoped-repair modules therefore have no production caller. A failed repair can also leave modified files in the sandbox if applied before revalidation.

## Selected approach: apply-time authoritative gate

The live path becomes:

```text
generate stream (TR4 QA candidate)
  -> client submits candidate + explicit generation context to apply endpoint
  -> apply endpoint creates/uses a durable generation record
  -> snapshot affected sandbox files
  -> apply candidate
  -> deterministic validation
  -> optional one scoped repair + full revalidation
  -> passed: persist report, emit apply complete
  -> failed: restore snapshot, persist terminal report, emit apply error
```

The UI must treat the apply endpoint's terminal `complete` as the generation's success. The candidate stream's earlier `complete` is renamed or interpreted as a non-terminal candidate-ready event so it cannot produce a success message before sandbox validation finishes.

## Durable generation context

Before applying a candidate, the client sends a validated context object:

- project ID
- optional existing generation ID
- mode: `scratch`, `edit`, `inspiration`, or `clone`
- original prompt and target URL
- sandbox ID

The server creates a generation record when the client has none, persists artifact and validation payloads, and moves the record through applying, validating, repairing, and terminal stages. Direct legacy calls without valid context are rejected rather than reporting a successful apply without quality evidence.

## Sandbox snapshot and rollback

The sandbox service receives a narrow snapshot contract limited to files that an apply request can mutate. The snapshot records file contents and absence markers before the first write. On validation, generator, patch, or apply failure after the snapshot exists, the service restores original files and removes files that did not previously exist. Rollback runs exactly once and its outcome is attached to terminal validation evidence.

The snapshot is not a product-version system and does not change existing project-version routes. It is an in-request safety boundary for the generated candidate.

## Mode behavior

### Scratch and edit

Run static, dependency, build, browser, accessibility, responsive, and honesty/originality checks against the applied sandbox. A passing result emits the apply completion event. A failed result rolls back and emits an error event with persisted evidence.

### Inspiration

Run the same hard gates. The current builder does not yet have a durable extracted brand bundle, so the live adapter records brand-language evaluation as unavailable and fails closed with a `capture-policy`/reference-evidence terminal result rather than inventing a pass. A later reference-capture integration can supply the brand bundle without weakening the gate.

### Clone

Clone success requires desktop and mobile source capture, source layout evidence, and output visual evidence. The current builder only has a preview screenshot and no durable dual reference bundle. Until that capture path is implemented, clone application fails closed with a clear `reference evidence unavailable` terminal result, rolls back, and never emits success. This preserves fidelity claims and avoids accepting a clone on incomplete evidence.

## Production adapters

The composition root adapts existing services into `ValidationRunnerDependencies`:

- static rules: `validateStaticRules`
- dependency gate: `validateDependencies`
- build gate: `validateSandboxBuild`
- runtime/accessibility/responsive: `validateBrowser`
- scratch/edit visual: deterministic originality/honesty result derived from passed static rules
- inspiration/clone: explicit evidence-unavailable terminal result until the durable reference-capture plan lands

The repair generator remains the configured TR4 repair route. It receives the existing bounded repair context. It cannot receive policy, provider, secret, sandbox-infrastructure, user-input, or missing-reference failures.

## Strict release screenshot gate

`tests/e2e/quality-gates.spec.ts` uses `maxDiffPixelRatio: 0`. Its CSS mask remains limited to `data-screenshot-dynamic` markers for timestamps, random IDs, and sandbox URLs. The Next development indicator stays disabled by `devIndicators: false` so no framework chrome enters snapshots.

## Error and SSE contract

The apply SSE emits:

- `validation-started`
- `validation-report` with safe summary and final status
- `rollback-started` / `rollback-complete` when required
- `complete` only after `finalStatus: "passed"`
- `error` for every failed final status; its safe message names the failed stage but does not expose secrets

The client sets “Generation complete” only after apply `complete`. For an error, it preserves the user prompt and surfaces the validation summary instead of claiming a finished project.

## Tests

- Request contract rejects missing durable generation context.
- Candidate-ready generation output does not create a terminal success state.
- Passing scratch/edit apply validates and emits exactly one terminal completion.
- Failed build/browser/accessibility validation restores prior sandbox content and emits no completion.
- Eligible failure performs one repair then either passes or rolls back after failed revalidation.
- Ineligible and missing-reference failures never invoke the repair model and restore the snapshot.
- Screenshot tests fail on a one-pixel unmasked difference and pass only when that pixel lies in an explicit mask.

## Out of scope

- Durable Firecrawl/Crawlee/Scrapling reference-capture implementation.
- Replacing the existing TR4 QA gate.
- Reworking builder UI beyond terminal-state semantics.
- Changing project-version history or provider routing.
