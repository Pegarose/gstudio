# Builder Workbench Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the builder’s Generated files cards into a tabbed single-file workbench and add a responsive Terminal/Brand drawer without changing generation, apply, sandbox, or validation contracts.

**Architecture:** Keep presentation in `app/generation/page.tsx` and tokens/responsive behavior in `app/generation/builder.module.css`. Add only local UI state and derived values; reuse `generationProgress`, `codeApplicationState`, `responseArea`, and existing inspiration context. Add static UI contracts before implementation, then verify with builder tests, TypeScript, and production build.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS Modules, existing `react-syntax-highlighter`, Node `node:test` static UI contracts.

## Global Constraints

- Preserve the existing 405px chat rail and live sandbox preview.
- Do not add API routes, database tables, generation events, provider calls, or packages.
- Keep `candidate-ready` separate from apply terminal `complete`.
- Do not add SEO, review, publish, analytics, or marketing panels.
- Do not delete routes or legacy compatibility state.
- No editable code mutation or server-side diff engine in this pass.
- Drawer controls require visible focus rings, Escape dismissal, and narrow-screen bottom-sheet behavior.
- No horizontal scroll at 320, 375, 414, or 768px; reduced motion is opacity-only and <=150ms.

---

### Task 1: Add failing UI contracts

**Files:**
- Modify: `tests/generation-builder-ui.test.cjs`
- Read: `app/generation/page.tsx`, `app/generation/builder.module.css`

**Interfaces:**
- Consumes: existing static source-string fixtures.
- Produces: regression assertions for file tabs, drawer semantics, and truthful status copy.

- [ ] **Step 1: Write the failing tests**

Add the stylesheet read near the existing builder source read:

```js
const builderStyles = readFileSync(resolve(__dirname, '../app/generation/builder.module.css'), 'utf8');
```

Add these tests:

```js
test('builder exposes workbench file tabs and active editor', () => {
  assert.match(builder, /data-testid="workbench-file-tabs"/);
  assert.match(builder, /data-testid="workbench-file-tab/);
  assert.match(builder, /data-testid="workbench-active-file"/);
  assert.match(builder, /selectedFile/);
});

test('builder exposes terminal and brand drawer truthfully', () => {
  assert.match(builder, /data-testid="workbench-drawer"/);
  assert.match(builder, /Terminal/);
  assert.match(builder, /Brand/);
  assert.match(builder, /Candidate ready · awaiting validation/);
  assert.match(builder, /Validated and live/);
  assert.match(builder, /aria-expanded/);
  assert.match(builder, /Escape/);
});

test('builder drawer has desktop and reduced-motion styles', () => {
  assert.match(builderStyles, /workbenchDrawer/);
  assert.match(builderStyles, /max-height:\s*52vh/);
  assert.match(builderStyles, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Run the red test**

```powershell
node --test tests/generation-builder-ui.test.cjs --test-name-pattern="workbench|drawer"
```

Expected: FAIL because the new testids, labels, and CSS classes do not exist.

- [ ] **Step 3: Commit the red test**

```powershell
git add tests/generation-builder-ui.test.cjs
git commit -m "test: define builder workbench contracts"
```

### Task 2: Add local workbench state and derived values

**Files:**
- Modify: `app/generation/page.tsx` near existing `activeTab`, `selectedFile`, and progress state.

**Interfaces:**
- Consumes: `generationProgress`, `codeApplicationState`, `responseArea`, `conversationContext`, and `selectedFile`.
- Produces: drawer state, active file, phase label, and brand-context presence for the render layer.

- [ ] **Step 1: Add state**

```ts
type WorkbenchDrawerTab = 'terminal' | 'brand';
const [workbenchDrawerOpen, setWorkbenchDrawerOpen] = useState(false);
const [workbenchDrawerTab, setWorkbenchDrawerTab] = useState<WorkbenchDrawerTab>('terminal');
```

- [ ] **Step 2: Add derived values before `renderMainContent`**

```ts
const availableWorkbenchFiles = useMemo(() => {
  const files = [...generationProgress.files];
  if (generationProgress.currentFile && !files.some(file => file.path === generationProgress.currentFile?.path)) {
    files.push({ ...generationProgress.currentFile, completed: false });
  }
  return files.filter((file, index, all) => all.findIndex(candidate => candidate.path === file.path) === index);
}, [generationProgress.files, generationProgress.currentFile]);

const activeWorkbenchFile = availableWorkbenchFiles.find(file => file.path === selectedFile) || availableWorkbenchFiles[0] || null;
const workbenchPhase = codeApplicationState.stage === 'complete' ? 'validated' : codeApplicationState.stage ? 'applying' : generationProgress.isGenerating ? 'generating' : availableWorkbenchFiles.length ? 'candidate' : 'idle';
const workbenchStatusLabel = workbenchPhase === 'validated' ? 'Validated and live' : workbenchPhase === 'candidate' ? 'Candidate ready · awaiting validation' : workbenchPhase === 'applying' ? 'Applying and validating' : workbenchPhase === 'generating' ? 'Generating candidate' : 'Ready';
const hasBrandContext = Boolean(conversationContext.scrapedWebsites.some(site => site.content?.brandGuidelines || site.content?.guidelines));
```

- [ ] **Step 3: Add automatic Terminal opening**

Add an effect that opens the drawer and selects Terminal while generation/apply is active or `responseArea` contains an `[error]` line. It must not open on `candidate-ready` alone.

```ts
useEffect(() => {
  const hasTerminalError = responseArea.some(line => line.startsWith('[error]'));
  if (generationProgress.isGenerating || codeApplicationState.stage || hasTerminalError) {
    setWorkbenchDrawerOpen(true);
    setWorkbenchDrawerTab('terminal');
  }
}, [generationProgress.isGenerating, codeApplicationState.stage, responseArea]);
```

- [ ] **Step 4: Add Escape dismissal**

Register a window `keydown` listener only while the drawer is open; `Escape` calls `setWorkbenchDrawerOpen(false)`, and the effect removes the listener on cleanup.

- [ ] **Step 5: Run TypeScript**

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

### Task 3: Replace file cards with tabs and one active editor

**Files:**
- Modify: `app/generation/page.tsx` in the `activeTab === 'generation'` branch.
- Modify: `app/generation/builder.module.css`.

**Interfaces:**
- Consumes: `availableWorkbenchFiles`, `activeWorkbenchFile`, `selectedFile`, and existing syntax-highlighter language mapping.
- Produces: tablist and active editor testids; keeps streaming fallback intact.

- [ ] **Step 1: Add the tab strip**

Render above the editor:

```tsx
<div className={styles.workbenchFileTabs} data-testid="workbench-file-tabs" role="tablist" aria-label="Generated files">
  {availableWorkbenchFiles.map(file => (
    <button key={file.path} type="button" role="tab" aria-selected={activeWorkbenchFile?.path === file.path} data-testid={`workbench-file-tab-${file.path.replaceAll('/', '-')}`} className={`${styles.workbenchFileTab} ${activeWorkbenchFile?.path === file.path ? styles.workbenchFileTabActive : ''}`} onClick={() => setSelectedFile(file.path)} title={file.path}>
      <span aria-hidden="true">{getFileIcon(file.path)}</span>
      <span className={styles.workbenchFileTabLabel}>{file.path.split('/').pop()}</span>
      <span className={file.edited ? styles.workbenchFileTabEdited : styles.workbenchFileTabState}>{file.edited ? '●' : '·'}</span>
    </button>
  ))}
</div>
```

- [ ] **Step 2: Render one active file**

Replace the completed-file card map with a single `data-testid="workbench-active-file"` surface showing `activeWorkbenchFile.path`, its generated/edited/streaming badge, and the existing `SyntaxHighlighter`. Keep the existing extension-to-language mapping; do not add a parser or diff package.

- [ ] **Step 3: Preserve streaming behavior**

If no complete file exists, retain the current thinking/raw-stream/current-file fallback. The change must not hide an in-progress stream.

- [ ] **Step 4: Add editor/tab CSS**

Add `.workbenchFileTabs`, `.workbenchFileTab`, `.workbenchFileTabActive`, `.workbenchFileTabLabel`, `.workbenchFileTabEdited`, `.workbenchEditor`, `.workbenchEditorHeader`, `.workbenchEditorBody`, and generated/edited badge classes using existing `--builder-*` tokens. Tabs must overflow horizontally without page scroll; the editor body must scroll internally.

- [ ] **Step 5: Run focused tests**

```powershell
node --test tests/generation-builder-ui.test.cjs --test-name-pattern="workbench|drawer"
```

Expected: file-tab assertions pass; drawer assertions remain red until Task 4.

### Task 4: Add the Terminal/Brand drawer

**Files:**
- Modify: `app/generation/page.tsx` near the preview toolbar and workspace body.
- Modify: `app/generation/builder.module.css`.

**Interfaces:**
- Consumes: drawer state, `workbenchPhase`, `workbenchStatusLabel`, `responseArea`, `hasBrandContext`, and existing inspiration context.
- Produces: manual trigger, drawer tabs, terminal log, optional Brand summary, and truthful status banner.

- [ ] **Step 1: Add the toolbar trigger**

Add a `Terminal` button with `aria-expanded`, `aria-controls="workbench-drawer"`, and a toggle handler that selects the Terminal tab.

- [ ] **Step 2: Add the drawer shell**

Render an `aside` with `id`/`data-testid="workbench-drawer"`, close button, `Terminal`/`Brand` tab buttons, and a status header. Place it inside `workspaceBody` as an absolute overlay so the 405px chat rail does not resize.

- [ ] **Step 3: Render Terminal content**

Show the phase badge, `workbenchStatusLabel`, scrollable `responseArea` lines, and `No terminal output yet.` when empty. Errors must keep the Terminal tab selected.

- [ ] **Step 4: Render Brand content**

When `hasBrandContext` is false, show an empty explanation. When true, show only existing source URL, style name, palette/type/spacing/radius fields, and the “visual language only / original build” framing. Do not add SEO/review/publish metrics or mutate state.

- [ ] **Step 5: Add responsive and reduced-motion CSS**

Desktop drawer: `position:absolute`, right edge, width `22.5rem`, full workspace height. Under `900px`: `left:0`, `width:100%`, `max-height:52vh`, top border, rounded top corners. Add focus-visible styles, internal scrolling, and `@media (prefers-reduced-motion: reduce)` with opacity transition <=150ms.

- [ ] **Step 6: Run focused tests**

```powershell
node --test tests/generation-builder-ui.test.cjs --test-name-pattern="builder|generation|workbench|drawer"
```

Expected: all matching tests pass, including candidate/apply status distinctions.

### Task 5: Verify and checkpoint

**Files:**
- Modify only intended builder/test files if a verification failure identifies a concrete issue.

- [ ] **Step 1: Run builder/generation tests**

```powershell
npm run test:legacy -- --test-name-pattern="builder|generation"
```

Expected: all matching tests pass.

- [ ] **Step 2: Run TypeScript**

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run production build**

```powershell
npm run build
```

Expected: successful Next build; existing image/Compose warnings may remain.

- [ ] **Step 4: Inspect diff**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended workbench files plus plan/spec documents changed.

- [ ] **Step 5: Commit implementation**

```powershell
git add app/generation/page.tsx app/generation/builder.module.css tests/generation-builder-ui.test.cjs
git commit -m "feat: add builder workbench overlay"
```
