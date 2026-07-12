---
name: edit-examples
description: Surgical edit patterns. Load on any edit request (UPDATE_COMPONENT,
  UPDATE_STYLE, FIX_ISSUE, ADD_FEATURE, REFACTOR, ADD_DEPENDENCY). Do NOT load
  for FULL_REBUILD or first-time generation.
activation: edit-mode-only
priority: high
---

# Edit Examples — Surgical Edit Discipline

## Core rule
You are a surgeon, not an artist repainting the canvas. Change only what the
request names. Preserve everything else exactly: imports, exports, formatting,
structure, unrelated classes. Always return the COMPLETE file for each edited
file — never truncate with "..." or "rest unchanged".

## Output contract (edit blocks)
Emit each change as an <edit> block. The runtime parses these (see
lib/morph-fast-apply.ts) and applies them via Morph fast-apply:

<edit>
<file>src/components/Header.jsx</file>
<instructions>Change the nav background from white to slate-900.</instructions>
<update>
// only the minimal changed region, with enough surrounding
// context for a clean merge
</update>
</edit>

Paths are project-relative (src/... , public/... , index.html, or a known
config file). Do not invent new files when an existing one covers the change.

## Edit types and expected behavior

### UPDATE_STYLE — "change background to blue", "make the heading bigger"
Do: change ONLY the specific class/style named.
Don't: refactor styling, touch other classes, restructure the component.
Example: user says "make the CTA button green" → change only that button's
color class; leave every other class and element untouched.

### UPDATE_COMPONENT — "add a subtitle to the hero"
Do: edit only the named component; preserve 99% of the file.
Don't: rewrite the component, rename props, reorder unrelated JSX.
Always check App.jsx first to confirm the component exists and how it is
imported before editing.

### FIX_ISSUE — "the button doesn't work", "fix the overflow"
Do: locate and fix the specific defect; preserve existing behavior otherwise;
add error handling only where the bug requires it.
Don't: "improve" surrounding code or refactor while fixing.

### ADD_FEATURE — "add a testimonials section"
Do: create the new component in the correct directory, THEN import and use it
in the parent, update routing if it is a new page, match existing design
tokens and patterns.
Don't: leave the new component unwired; don't duplicate an existing component
under a similar name (check App.jsx and existing files first).
Workflow: 1) create NewComponent.jsx  2) import it in the parent
3) render it in the parent's JSX.

### REFACTOR — "clean up the Header"
Do: improve readability without changing behavior or visible output; keep all
features; follow project conventions.
Don't: change functionality or design under the guise of refactoring.

### ADD_DEPENDENCY — "add framer-motion animations"
Do: add the import; the sandbox auto-detects and installs missing packages
from import statements. Update package.json only if the runtime requires it.
Don't: hand-edit lockfiles.

## Component-overlap guardrails
Before creating a file, resolve these common overlaps:
- "nav" / "navigation" → usually INSIDE Header.jsx, not a separate file
- "menu" → usually part of Header/Nav
- "logo" → typically in Header, not standalone
Rule: check Header.jsx first; only create Nav.jsx if navigation exists nowhere.

## Never
- Never truncate a returned file.
- Never remove code the user did not ask to remove.
- Never change formatting/structure outside the requested edit.
- Never invent testimonials, metrics, or client logos when adding sections
  (honest-copy rule from design-core still applies).