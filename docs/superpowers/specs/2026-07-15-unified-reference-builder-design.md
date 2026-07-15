# Unified Reference Builder — Design Specification

**Date:** 2026-07-15  
**Status:** Approved direction; awaiting written-spec review  
**Scope:** Builder launch UX, generation intent routing, model visibility, E2B validation reliability

## Problem

G Studio currently exposes Clone, Inspiration, and Scratch as separate launch modes and exposes multiple model roles in the primary project form. Real smoke tests showed that the mode wiring and Firecrawl capture work, but production completion is blocked by shared reliability issues: E2B browser provisioning, validator false positives for tokenized inline styles, and malformed model output. The current UX also implies that exact cloning is the primary workflow even though the intended product behavior is original builds that may use a URL as visual reference.

## Goals

1. Make the primary flow feel like Bolt/Lovable: one project brief with an optional reference URL.
2. Treat URL-based work as original inspiration/reference by default, not pixel cloning.
3. Keep model selection simple: one visible Builder model, with role routing retained internally.
4. Preserve deterministic validation and repair; do not trade reliability for a simpler UI.
5. Make scratch, scratch-plus-reference, and inspiration smoke tests reach a truthful terminal `complete` after live apply validation.
6. Preserve compatibility with existing projects and stored `clone` intent values.

## Non-goals

- Removing the validator or browser checks.
- Rebuilding the whole dashboard or builder visual system.
- Supporting copyright-infringing or deceptive brand impersonation.
- Exposing team orchestration/persona management in the primary launch flow.

## User experience

The dashboard has one primary “Create project” form:

- Project name
- “What do you want to build?” brief
- Optional “Reference URL” field
- Optional reference toggle, enabled by default when a URL is present

The form no longer presents Clone as a primary tab. Existing mode labels may remain in internal history and analytics, but new launches use:

- `scratch`: no reference URL
- `inspiration`: reference URL plus an original-build brief

The UI should explain that a reference URL contributes visual language, layout cues, and interaction patterns; it does not copy proprietary text, logos, or media. Advanced model-role controls remain available behind an Advanced/Team Settings surface.

## Intent resolution

The launch contract becomes:

```ts
type BuilderIntent = "scratch" | "inspiration";

interface BuilderBrief {
  prompt: string;
  referenceUrl?: string | null;
  intent?: BuilderIntent;
}
```

Resolution rules:

1. No URL and no explicit reference language → `scratch`.
2. URL present with “similar”, “inspired by”, “same visual language”, or equivalent → `inspiration`.
3. Legacy `clone` values are normalized to `inspiration` for new execution while preserving the original value in historical records.
4. Explicit exact-copy language is still handled by the safety/ethics guard; it does not bypass original-content substitutions.

The generation API continues accepting legacy fields during migration. The builder writes the normalized intent for new generations.

## Model routing

The primary UI shows one Builder model, defaulting to `OmniRoute auto/best-coding`.

Internally the registry keeps role boundaries:

- Builder/generation: `auto/best-coding`
- Repair: the same coder route
- Planning: skipped for compact briefs or executed by the same route when needed
- QA: deterministic checks always run; model-based review uses a hidden OmniRoute reasoning route when required

This is a one-model user experience, not a one-check system. The validator remains authoritative for safety, build correctness, accessibility, responsive behavior, and quality-gate evidence.

## Generation and validation pipeline

```text
brief + optional URL
  → intent normalization
  → Firecrawl reference capture (inspiration only)
  → single Builder model
  → invisible-character / unsafe-import sanitizer
  → static validation + Vite build
  → Chromium browser validation at required widths
  → optional hidden QA review and scoped repair
  → live apply with rollback support
  → terminal complete only after validation passes
```

`candidate-ready` remains an intermediate generation event. It must never be presented as final success until the live apply stream emits terminal `complete`.

## Reliability changes

### E2B browser provisioning

- Preinstall and cache the Chromium binary in the E2B template used by browser validation.
- Verify the executable during sandbox setup and report a distinct `sandbox-infrastructure` failure if it is unavailable.
- Add bounded retry/backoff for transient E2B `fetch failed` provisioning errors.
- Clean the manager registry and legacy globals before retrying a failed lease.
- Do not convert browser provisioning failures into generic model-quality failures.

### Static validator token handling

The validator continues rejecting literal inline colors and font families, but accepts token references such as `var(--color-text-primary)` and `var(--font-display)`. Literal hex, rgb, hsl, or un-tokenized font names remain violations.

### Generated-code normalization

Before validation:

- Remove zero-width and other invisible formatting characters from generated source where safe.
- Reject or repair `require()` usage in ESM/TSX/JSX artifacts.
- Detect inline custom-property strings that cannot resolve as CSS values.
- Preserve the original candidate for evidence, but validate the normalized candidate.

### Failure surface

The builder shows one actionable failure state with the failure class and next action:

- `sandbox-infrastructure`: retry provisioning
- `capture-policy`: reference capture unavailable or unreadable
- `static-validation`: generated code violates deterministic rules
- `browser-validation`: Chromium/accessibility/responsive checks failed
- `model-quality`: QA/repair could not produce a passing candidate

## Backward compatibility

- Existing projects with `clone` mode remain readable.
- Existing `clone` records are displayed as “Reference build” where a user-facing label is required.
- Existing model-role columns remain in the database.
- The `/generation` route continues accepting old session keys during migration, but writes normalized intent for new work.

## Verification plan

The release smoke matrix must include all three user stories:

| Scenario | Reference | Expected terminal result |
|---|---|---|
| Scratch | None | `candidate-ready` → apply validation → `complete` |
| Scratch with reference | URL, original brief | capture → `candidate-ready` → `complete` |
| Inspiration | URL, visual-language brief | capture → `candidate-ready` → `complete` |

Each scenario must verify:

- project registration and sandbox lease
- correct normalized intent
- correct model route
- no proprietary-copy fallback
- static/build/browser validation evidence
- preview iframe contains the generated H1/content
- cleanup removes the temporary project, sandbox lease, and manager state

Unit and integration coverage must additionally assert:

- tokenized inline styles are accepted while literal values remain rejected
- invisible-character and ESM `require()` guards are deterministic
- transient E2B provisioning retries are bounded
- legacy `clone` normalizes to `inspiration`
- the UI does not report success on `candidate-ready`

## Rollout order

1. Fix E2B browser provisioning, retry, and failure classification.
2. Fix validator token-reference handling and generated-code normalization.
3. Add the unified `scratch`/`inspiration` launch contract with legacy compatibility.
4. Move model-role selectors behind Advanced settings and default to one Builder route.
5. Run the three end-to-end smoke scenarios and remove only their temporary artifacts.
6. Keep the existing visual builder redesign unchanged unless smoke evidence identifies a related layout defect.

## Acceptance criteria

- A new user can provide only a brief, or a brief plus URL, without choosing a clone mode.
- The default flow uses one visible OmniRoute Builder model.
- Scratch and URL-reference flows do not invoke clone-fidelity behavior.
- A generated candidate cannot be reported as complete before live validation passes.
- All three smoke scenarios complete successfully on a clean Docker/E2B environment.
- Any infrastructure or model-quality failure is classified accurately and is retryable where safe.
