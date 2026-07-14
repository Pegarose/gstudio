const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const builderPage = resolve(__dirname, '../app/generation/page.tsx');
const dashboard = readFileSync(resolve(__dirname, '../app/page.tsx'), 'utf8');
const source = readFileSync(builderPage, 'utf8');

test('dashboard and builder normalize role-specific TR4 model selections', () => {
  assert.match(dashboard, /normalizeTeamModel\("planning"/);
  assert.match(dashboard, /normalizeTeamModel\("coder"/);
  assert.match(dashboard, /normalizeTeamModel\("qa"/);
  assert.match(dashboard, /selectedQaModel/);
  assert.match(source, /teamModelOptions\.planning/);
  assert.match(source, /teamModelOptions\.coder/);
  assert.match(source, /teamModelOptions\.qa/);
  assert.match(source, /normalizeTeamModel\('planning', storedPlanningModel\)/);
  assert.match(source, /normalizeTeamModel\('coder', storedCoderModel\)/);
  assert.match(source, /normalizeTeamModel\('qa', storedQaModel\)/);
  assert.match(source, /normalizeTeamModel\('planning', data\.project\.planning_model\)/);
  assert.match(source, /generationMode,/);
});

test('builder exposes a task-focused workspace instead of browser-like chrome', () => {
  const source = readFileSync(builderPage, 'utf8');

  assert.match(source, /import styles from ['"]\.\/builder\.module\.css['"]/);
  assert.match(source, /data-testid="generation-workspace"/);
  assert.doesNotMatch(source, /Start with a clear idea/);
  assert.match(source, /styles\.workspaceBody/);
  assert.match(source, /styles\.chatShell/);
  assert.match(source, /styles\.messageAuthor/);
  assert.match(source, /styles\.composerDock/);
  assert.match(source, /styles\.starterPrompt/);
  assert.match(source, /styles\.agentButton/);
  assert.match(source, /styles\.composerSubmit/);
  assert.doesNotMatch(source, /Ready for your next instruction/);
  assert.doesNotMatch(source, /Review current preview/);
  assert.doesNotMatch(source, /3 yeni tasarım dene/);
  assert.doesNotMatch(source, />Mode</);
  assert.doesNotMatch(source, /Review your SEO/);
  assert.doesNotMatch(source, /import SidebarInput/);
  assert.match(source, /aria-label="Switch to preview"/);
  assert.match(source, /aria-label="Turn on visual edit mode"/);
  assert.match(source, /aria-label="Open version history"/);
  assert.match(source, /const hasProjectPreview =/);
  assert.doesNotMatch(source, /<section className=\{styles\.statusCard\}/);
  assert.doesNotMatch(source, /Traffic light control dots/);
});

test('builder workspace owns its typography instead of inheriting a serif fallback', () => {
  const source = readFileSync(resolve(__dirname, '../app/generation/builder.module.css'), 'utf8');

  assert.match(source, /font-family: var\(--font-geist-sans\), ui-sans-serif/);
  assert.match(source, /\.workspaceBody/);
  assert.match(source, /\.chatShell/);
  assert.match(source, /\.messageAuthor/);
  assert.match(source, /\.composerDock/);
  assert.match(source, /\.starterPrompt/);
  assert.match(source, /\.agentButton/);
  assert.match(source, /\.modeButton/);
  assert.match(source, /\.composerSubmit/);
});

test('builder creates a project before requesting an explicit-ID sandbox', () => {
  const source = readFileSync(builderPage, 'utf8');

  assert.match(source, /projectIdForSandbox/);
  assert.match(source, /sessionStorage\.setItem\('projectId', String\(regData\.project\.id\)\)/);
  assert.match(source, /createSandbox\(true, projectIdForSandbox\)/);
  assert.match(source, /projectId: String\(projectId\)/);
  assert.doesNotMatch(source, /body: JSON\.stringify\(\{\}\)/);
});

test('builder reports a passed generation quality gate', () => {
  assert.match(source, /data\.type === ["']validation["']/);
  assert.match(source, /Quality gate passed/);
  assert.match(source, /repairCount/);
});

test('chat generation stream propagates terminal SSE errors after parsing', () => {
  const chatStreamStart = source.indexOf("const response = await fetch('/api/generate-ai-code-stream'");
  const chatStreamEnd = source.indexOf('if (generatedCode) {', chatStreamStart);
  const chatStream = source.slice(chatStreamStart, chatStreamEnd);

  assert.match(
    chatStream,
    /let data: any;\s*try \{\s*data = JSON\.parse\(line\.slice\(6\)\);\s*\} catch \(e\) \{\s*console\.error\('Failed to parse SSE data:', e\);\s*continue;\s*\}\s*if \(data\.type === 'error'\) \{\s*throw new Error\(data\.error \|\| data\.message/,
  );
});

test('auto-start waits for the explicit sandbox and carries its ID through apply', () => {
  const source = readFileSync(builderPage, 'utf8');

  assert.match(source, /autoStart === 'true' && !showHomeScreen && homeUrlInput && sandboxData/);
  assert.match(source, /\[showHomeScreen, homeUrlInput, sandboxData\]/);
  assert.match(source, /Promise\.resolve\(sandboxData\)/);
  assert.match(source, /const activeSandboxData = createdSandbox \|\| sandboxData/);
  assert.match(source, /sandboxId: activeSandboxData\?\.sandboxId/);
  assert.match(source, /applyGeneratedCode\(\s*generatedCode,\s*false,\s*activeSandboxData,/s);
});

test('builder keeps candidate generation distinct from validated apply completion', () => {
  const chatGenerationStart = source.indexOf('const sendChatMessage = async () =>');
  const chatGenerationEnd = source.indexOf('const downloadZip = async () =>', chatGenerationStart);
  const chatGeneration = source.slice(chatGenerationStart, chatGenerationEnd);
  const initialGenerationStart = source.indexOf('const startGeneration = async () =>');
  const initialGenerationEnd = source.indexOf('\n  return (', initialGenerationStart);
  const initialGeneration = source.slice(initialGenerationStart, initialGenerationEnd);

  assert.match(source, /data\.type === ['"]candidate-ready['"]/);
  assert.match(source, /case ['"]validation-report['"]/);
  assert.match(source, /case ['"]complete['"]/);
  assert.match(source, /const applicationPassed = await applyGeneratedCode/);
  assert.match(source, /generationContext: scopedGenerationContext/);
  assert.doesNotMatch(chatGeneration, /data\.type === ['"]complete['"]\)\s*\{\s*generatedCode/);
  assert.doesNotMatch(initialGeneration, /data\.type === ['"]complete['"]\)\s*\{\s*generatedCode/);
  assert.doesNotMatch(initialGeneration, /AI recreation generated![\s\S]{0,240}await applyGeneratedCode/);
  assert.match(chatGeneration, /if \(generatedCode\)[\s\S]{0,3400}else \{\s*throw new Error\(['"]Failed to generate a candidate/);
});

test('builder renders the truthful progress surface only from existing live state', () => {
  assert.match(source, /GenerationProgressSurface/);
  assert.match(source, /toGenerationProgressPhase/);
  assert.match(source, /isGenerationProgressActive/);
  assert.match(source, /phase=\{toGenerationProgressPhase\(/);
  assert.match(source, /case ['"]validation-report['"][\s\S]{0,280}Validation report:/);
  assert.match(source, /case ['"]error['"][\s\S]{0,280}iframeRef\.current\.src = iframeRef\.current\.src/);
  assert.match(source, /loadingStage/);
  assert.match(source, /isCapturingScreenshot/);
  assert.match(source, /isPreparingDesign/);
  assert.match(source, /generationProgress/);
  assert.match(source, /codeApplicationState/);
});
