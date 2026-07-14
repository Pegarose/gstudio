# Task 3 review-fix report

## Root cause

The live apply route caught `providerInstance.writeFile` errors per file,
recorded them in `results.errors`, and continued to resolve the candidate
mutation barrier. That allowed deterministic validation to run against a
partially applied candidate and left a path to an incorrect `complete` event.

The builder also replaced its pending AI message with `Code generated!` and
attached `appliedFiles` before the apply SSE stream had emitted terminal
`complete`.

## Fix

- Added `lib/generation/live/live-apply-terminal.ts`.
  - `createLiveCandidateMutationBarrier` starts only after activation has
    snapshotted, and exposes one explicit completion or rejection path.
  - `writeLiveCandidateFile` validates the already-scoped path, creates the
    safe parent directory, and lets provider failures reject the mutation.
  - `emitLiveActivationTerminalEvents` emits `validation-report` for every
    terminal result; failed results then emit rollback start/completion and
    `error`, never `complete`.
- The apply SSE route now uses that seam, rethrows a file-write failure after
  its `file-error` progress event, and awaits activation before any terminal
  success event.
- The builder now calls a candidate `Candidate ready. Applying it and running
  deterministic validation…`; it does not attach applied-file metadata until
  the apply terminal has passed. Its error branch keeps the neutral candidate
  message and adds only an error message.

## Behavioral coverage

`tests/integration/live-apply-terminal.test.ts` drives the production seam:

1. real `SandboxService` provider registry -> failing provider write;
2. real `LiveValidationActivation` -> snapshot/rollback;
3. terminal persistence double -> exactly one failed persistence;
4. terminal SSE event helper -> `validation-report`, `rollback-started`,
   `rollback-complete`, `error`, and no `complete`.

Existing activation coverage remains the authority for passed validation,
single repair/revalidation, and clone/inspiration missing-reference no-repair
outcomes. Route and builder contract tests assert that production wiring keeps
candidate, validation, and terminal apply events distinct.

## Test evidence

RED evidence captured before implementation:

- `npx tsx --test tests/integration/live-apply-terminal.test.ts` failed because
  the live terminal helper/module did not exist.
- The same focused test then failed because the route had not yet delegated to
  the helper.
- `node --test tests/generation-builder-ui.test.cjs` failed because the
  candidate-ready copy did not exist.

GREEN verification:

```text
npx tsx --test tests/integration/live-apply-route.test.ts \
  tests/integration/live-apply-terminal.test.ts \
  tests/integration/live-validation-activation.test.ts \
  tests/integration/repair-cycle.test.ts \
  tests/integration/validation-runner.test.ts
# 30 passed

node --test tests/generation-builder-ui.test.cjs tests/brand-guidelines.test.cjs
# 12 passed

npx tsc --noEmit
# passed

git diff --check
# passed
```

## Scope retained

No global sandbox state was added to validation or rollback. Clone and
inspiration durable-reference fail-close behavior from Task 2 was not changed.
Untracked local Playwright/output/log artifacts were preserved and excluded
from the commit.
