const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const dashboard = readFileSync(resolve(__dirname, '../app/page.tsx'), 'utf8');
const builder = readFileSync(resolve(__dirname, '../app/generation/page.tsx'), 'utf8');
const route = readFileSync(resolve(__dirname, '../app/api/generate-ai-code-stream/route.ts'), 'utf8');
const intentRoute = readFileSync(resolve(__dirname, '../app/api/analyze-edit-intent/route.ts'), 'utf8');
const providerContracts = readFileSync(resolve(__dirname, '../lib/models/contracts.ts'), 'utf8');
const providerManager = readFileSync(resolve(__dirname, '../lib/ai/provider-manager.ts'), 'utf8');
const agentInstructions = readFileSync(resolve(__dirname, '../AGENTS.md'), 'utf8');
const structuredPipelinePlan = readFileSync(resolve(__dirname, '../docs/superpowers/plans/2026-07-13-structured-generation-pipeline.md'), 'utf8');

test('project launcher exposes clone, inspire, and scratch as distinct modes', () => {
  assert.match(dashboard, /"clone" \| "inspire" \| "scratch"/);
  assert.match(dashboard, /setModalTab\("inspire"\)/);
  assert.match(dashboard, /sessionStorage\.setItem\("generationIntent", generationIntent\)/);
});

test('builder routes inspiration without the unreachable legacy brand flag', () => {
  assert.match(builder, /resolveGenerationIntent/);
  assert.match(builder, /Analyzing .* for visual direction/);
  assert.match(builder, /DO NOT invent analytics, reach, sentiment, percentages, or performance metrics/);
  assert.match(builder, /storedGenerationIntent !== 'inspire'/);
  assert.doesNotMatch(builder, /brandExtensionMode/);
  assert.doesNotMatch(builder, /shouldAutoGenerate/);
});

test('generation API uses the canonical context loader and explicit intent', () => {
  assert.match(route, /loadAgentContext/);
  assert.match(route, /generationIntent/);
  assert.match(route, /AI_STREAM_TIMEOUT_MS/);
  assert.doesNotMatch(route, /\.agents\/skills/);
  assert.doesNotMatch(route, /AGENTS\.md CORE SYSTEM RULES/);
});

test('generation stream timeout measures inactivity instead of total duration', () => {
  assert.match(route, /AI_STREAM_TIMEOUT_MS \|\| 180000/);
  assert.match(route, /const attemptController = new AbortController\(\)/);
  assert.match(route, /refreshStreamInactivityTimeout/);
  assert.match(route, /streamOptions\.abortSignal = attemptController\.signal/);
  assert.doesNotMatch(route, /AbortSignal\.timeout\(providerTimeoutMs\)/);
});

test('OpenCode fallback honors the configured TR4 provider without silently using Cline', () => {
  assert.match(route, /let activeStreamProvider/);
  assert.match(route, /activeStreamProvider !== 'tr4'/);
  assert.match(route, /activeStreamProvider = 'tr4'/);
  assert.match(route, /falling back to TR4 API/);
  assert.match(route, /const tr4FallbackModel = 'gpt-5\.6-sol'/);
  assert.doesNotMatch(route, /cline-pass/);
  assert.doesNotMatch(route, /falling back to Cline API/);
  assert.match(intentRoute, /Falling back to TR4 API/);
  assert.match(intentRoute, /const tr4FallbackModel = 'gpt-5\.6-sol'/);
  assert.doesNotMatch(intentRoute, /Cline fallback/);
  assert.doesNotMatch(intentRoute, /CLINE_API_KEY/);
  assert.doesNotMatch(route, /streamOptions\.model !== clineModel/);
});

test('runtime and generation specification do not define an unconfigured Cline provider', () => {
  assert.doesNotMatch(providerContracts, /\|\s*["']cline["']/);
  assert.doesNotMatch(providerManager, /case ["']cline["']/);
  assert.doesNotMatch(providerManager, /CLINE_API_KEY/);
  assert.doesNotMatch(agentInstructions, /primary AI -> Cline/);
  assert.doesNotMatch(structuredPipelinePlan, /\bCline\b/);
  assert.doesNotMatch(structuredPipelinePlan, /["']cline["']/);
});

test('builder surfaces terminal SSE errors and rolls back partial generation state', () => {
  assert.match(builder, /data\.type === 'error'/);
  assert.match(builder, /throw new Error\(data\.error \|\| data\.message/);
  assert.match(builder, /filesBeforeGeneration/);
  assert.match(builder, /files: filesBeforeGeneration/);
  assert.doesNotMatch(builder, /Failed to clone website: \$\{error\.message\}/);
});
