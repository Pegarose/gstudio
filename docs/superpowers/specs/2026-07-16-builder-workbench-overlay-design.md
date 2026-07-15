# Builder Workbench Overlay Design

> Status: approved design, implementation pending
> Date: 16 July 2026

## Goal

Make the G Studio builder feel like a focused production workbench without changing the current generation contract or adding a second backend workflow. The builder keeps the existing 405px chat rail and live preview, while the Code view becomes a tabbed single-file editor and operational details move into an on-demand right drawer.

## Scope

### In scope

- Replace the card-stacked Generated files presentation with file tabs and one active-file editor surface.
- Add a right-side drawer with `Terminal` and `Brand` tabs.
- Surface existing `responseArea`, generation progress, apply progress, and validation status in the Terminal tab.
- Surface existing inspiration/brand guideline data in the Brand tab when available.
- Keep `candidate-ready` visibly separate from validated apply terminal `complete`.
- Add responsive behavior for narrow screens, keyboard focus, reduced motion, and drawer dismissal.

### Out of scope

- No new API routes, database tables, or generation events.
- No change to OmniRoute routing, E2B lifecycle, quality gates, or apply semantics.
- No SEO, review, publish, analytics, or marketing panels.
- No deletion of existing builder routes or legacy compatibility state.
- No full IDE replacement, editable code mutation, or server-side diff engine.

## Files and ownership

Expected implementation changes:

- Modify `app/generation/page.tsx` for local view/drawer state, derived file selection, tab rendering, terminal/brand content, and status labels.
- Modify `app/generation/builder.module.css` for the workbench editor, file tabs, drawer, badges, and responsive bottom-sheet behavior.
- Modify `tests/generation-builder-ui.test.cjs` and/or add a focused UI contract test for drawer labels, candidate-ready wording, and terminal completion wording.

No files are deleted. No new component is required unless the final JSX extraction materially improves readability without changing behavior.

## Visual structure

```text
┌──────────────────────────────────────────────────────────────┐
│ topbar                                                       │
├───────────────┬──────────────────────────────────┬───────────┤
│ 405px chat    │ preview OR code workbench       │ drawer    │
│ rail          │                                  │ (optional)│
│               │ Code: file tabs + editor        │ Terminal  │
│               │ Preview: live sandbox canvas    │ Brand     │
└───────────────┴──────────────────────────────────┴───────────┘
```

### Code view

- The existing Code/View switch remains the primary mode switch.
- Code view has a compact tab strip derived from `generationProgress.files`.
- The first available file is selected automatically; selecting a tab updates `selectedFile`.
- Each tab shows a filename, file type marker, and a small state marker:
  - neutral: generated file
  - accent: edited file (`edited === true`)
  - success: completed file
- The editor surface shows only the active file. It uses the existing `SyntaxHighlighter` and language mapping.
- During streaming, the active file keeps the existing current-file/raw-stream fallback instead of showing an empty editor.
- The current implementation does not have durable before/after content for a true line diff. The first implementation therefore labels edits and uses changed-file emphasis; a real diff engine remains a later, explicit scope.

### Terminal drawer

- Trigger: a compact `Terminal` button in the preview toolbar and an automatic open when generation/apply is active or a terminal error occurs.
- Width: 360px on desktop, overlaying the right edge without resizing the 405px chat rail.
- Tabs:
  - `Terminal`: operational timeline and log lines.
  - `Brand`: reference evidence and visual-language context, when available.
- Terminal content order:
  1. Current phase badge (`Generating`, `Applying`, `Validating`, `Ready`, `Failed`).
  2. Candidate/apply truth banner.
  3. Scrollable log stream from `responseArea` and relevant generation/apply messages.
  4. Latest error with the existing actionable failure copy.
- Drawer close button, `Escape` dismissal, and `aria-expanded`/`aria-controls` are required.
- On viewport widths below 900px, the drawer becomes a bottom sheet with a maximum height of 52vh.

### Brand drawer tab

- Render only when inspiration/reference data exists; otherwise show a quiet empty state explaining that it appears after a visual reference is analyzed.
- Show source URL, extracted style name, palette swatches/labels, typography summary, radius/spacing summary, and the existing “visual language only / original build” framing.
- Do not show invented SEO, performance, analytics, or proof metrics.
- Treat all values as display-only context; this surface does not mutate generation state.

## State and data flow

Add only local UI state:

```ts
type WorkbenchDrawerTab = "terminal" | "brand";
const [drawerOpen, setDrawerOpen] = useState(false);
const [drawerTab, setDrawerTab] = useState<WorkbenchDrawerTab>("terminal");
```

Derived values:

- `availableFiles`: completed files plus the current file, de-duplicated by path.
- `activeWorkbenchFile`: selected file or the first available file.
- `terminalPhase`: derived from `generationProgress`, `codeApplicationState`, and validation metadata.
- `hasBrandContext`: true only when the existing inspiration guideline object is present and has usable display fields.

Existing generation/apply state remains authoritative. The UI must not infer terminal success from streamed code or `candidate-ready` alone.

## Interaction rules

- Clicking Code opens the workbench and preserves the last selected file.
- Clicking Preview leaves the drawer state intact but does not cover the iframe unless the user explicitly opens it.
- Starting generation/apply opens the Terminal drawer and selects the Terminal tab.
- A `candidate-ready` event updates the banner to `Candidate ready · awaiting validation`.
- Apply terminal `complete` updates the banner to `Validated and live`.
- Any terminal error opens the Terminal tab and keeps the drawer open until the user closes it.
- The Brand tab never replaces the terminal error; errors always force the Terminal tab first.

## Accessibility and responsive requirements

- All tabs and drawer controls are real buttons with visible `:focus-visible` rings.
- Drawer has a labelled dialog-like region, `aria-expanded`, and `aria-controls`; focus returns to the trigger on close where practical.
- Escape closes the drawer.
- No horizontal scroll at 320, 375, 414, or 768px.
- At narrow widths, the bottom sheet must not cover the composer permanently; it can be dismissed and reopened.
- Respect `prefers-reduced-motion`; drawer transitions become opacity-only and no longer than 150ms.
- Text in tabs and status badges must remain single-line or truncate with a title/accessible name.

## Failure handling

- Missing brand data: render the empty Brand state; do not throw.
- Missing logs: render the phase/status card and a “No terminal output yet” line.
- Unknown status/failure class: use the existing `formatBuilderFailure` copy and a neutral `Needs attention` badge.
- Drawer rendering must never block preview or chat interactions.

## Verification plan

Focused static/UI checks:

- Code view exposes file tabs and active-file selection.
- Terminal trigger, drawer tabs, close/Escape labels, and responsive class hooks exist.
- `candidate-ready` copy is not terminal success copy.
- Apply `complete` copy is visibly distinct and only tied to the existing apply state.
- Brand context is optional and does not introduce SEO/review/publish controls.

Runtime checks:

- `npm run test:legacy -- --test-name-pattern="builder|generation"`
- `npx tsc --noEmit`
- `npm run build`
- Manual browser check at desktop and narrow viewport widths with a generated smoke project, verifying Code → file tab → Terminal drawer → Preview flow.

## Acceptance criteria

1. The builder still has a 405px chat rail and live preview.
2. Code view presents one active file with selectable tabs instead of a vertical stack of full file cards.
3. Terminal drawer opens automatically for active/error operations and can be manually reopened.
4. Brand drawer content is optional, display-only, and reference-specific.
5. `candidate-ready` never displays “Validated and live” or another terminal success label.
6. Apply terminal `complete` displays the validated success state.
7. Existing generation, apply, sandbox, and validation tests remain green.
8. No new backend contract is introduced.
