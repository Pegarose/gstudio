# Generation Progress Surface Design

## Decision

Replace the builder's empty/right-pane spinner and generic chat status with a compact, production-grade progress surface. It must describe real work that the builder is performing and must never imply that code is complete before the apply-and-validation gate has passed.

## Problem

The current builder exposes a large blank workspace or a generic spinner while it captures a source, allocates a sandbox, plans, generates, applies, and validates. It also allows the candidate-generation stream to look terminal, leaving users with an empty Code panel even though no sandbox-applied result has been confirmed.

## Audience and primary action

- Audience: a person waiting for G Studio to create, modify, or adapt a web application.
- Primary action: wait with confidence and understand the current stage; no secondary interaction is required while work is in progress.
- Tone: technical, calm, and intentionally restrained.

## Selected design

Use a **workbench status rail**, not a full-screen loading illustration:

1. A concise header names the active operation (for example, "Preparing your workspace") and the current status supplied by the builder.
2. A six-step vertical/horizontal stage rail exposes real checkpoints: Workspace, Understand, Plan, Build, Apply, Verify. It marks the active step, preserves completed steps, and leaves future steps quiet.
3. A small CSS-only generative mark provides motion without fake browser or device chrome. It uses transform/opacity animation only, respects reduced motion, and is absent from the accessibility name.
4. A context line describes the actual target/mode only when it is known. It contains no estimated duration, invented file count, or fabricated quality claim.
5. The surface has `role="status"`, a concise `aria-live="polite"` message, and an accessible progress-bar value. It never traps focus or covers an existing error.

## State contract

The presentational component accepts a normalized phase and existing builder status text:

```ts
type GenerationProgressPhase =
  | "workspace"
  | "understand"
  | "plan"
  | "build"
  | "apply"
  | "verify";

type GenerationProgressSurfaceProps = {
  phase: GenerationProgressPhase;
  status: string;
  detail?: string;
  targetLabel?: string;
};
```

The component is visual-only. The parent remains the single owner of generation, sandbox, apply, and validation state. The builder maps its existing state to the normalized phase. The live apply gate owns whether a terminal success can be shown.

## Layout and responsive behavior

- Wide builder pane: an inset card with a left status column and a compact stage rail; the generative mark stays subordinate to the status.
- Narrow pane: the stage rail becomes a two-column wrap while status copy stays first and the progress bar remains visible.
- At 320, 375, 414, and 768 CSS pixels: no horizontal scrolling, no clipped labels, no fake device/browser frame, and no interactive controls.

## Visual system

- Preserve existing Tailwind semantic light/dark colors and the existing orange accent; do not introduce another theme or raw inline color values.
- Preserve the installed Geist/Inter type system. Status text uses normal roman type, a clear hierarchy, and no decorative italic heading.
- Use only two intentional motions: a short active-rail sweep and a low-amplitude mark pulse. `prefers-reduced-motion` disables continuous movement.
- Avoid gradient soup, fake terminal/browser chrome, invented progress percentages, and invented success claims.

## Acceptance criteria

1. The builder shows meaningful generation/apply status rather than a blank Code or View pane while an active operation is underway.
2. The component renders all six stages, communicates the current stage accessibly, and keeps current status text visible.
3. It is usable in light and dark mode and at 320/375/414/768 px without overflow.
4. It is purely presentational; it does not create sandbox, generation, or validation state.
5. Candidate generation cannot render the terminal "Generation complete" state. Only the apply path may do this after live validation passes.
6. No existing route, project behavior, or sandbox operation is deleted or replaced.

## Hallmark self-critique

| Axis | Score | Rationale |
| --- | --- | --- |
| Philosophy | 5 | Shows truthful work rather than decorative waiting. |
| Hierarchy | 5 | Operation, active phase, and contextual status read in that order. |
| Execution | 4 | A small extracted component protects the existing large builder page. |
| Specificity | 5 | Designed for generation, apply, and verification—not a generic loader. |
| Restraint | 5 | One accent, two motions, no made-up progress or fake chrome. |
| Variety | 4 | Workbench rail differs from a centered spinner while preserving G Studio. |

All axes are at least 3; the redesign may proceed.
