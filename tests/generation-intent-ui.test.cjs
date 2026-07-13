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

test('generation API sanitizes every model-facing prompt and context value', () => {
  assert.match(route, /import\s+\{\s*sanitizeGenerationModelInput\s*\}/);
  assert.match(route, /const modelInput = sanitizeGenerationModelInput\(\{ prompt, context: context \?\? \{\} \}\)/);
  assert.match(route, /const modelPrompt = modelInput\.prompt/);
  assert.match(route, /const modelContext = modelInput\.context as Record<string, any>/);
  assert.match(route, /loadAgentContext\(\{ intent: generationIntent, prompt: modelPrompt, isEdit \}\)/);
  assert.match(route, /content: modelPrompt/);
  assert.match(route, /Object\.entries\(modelContext\.currentFiles\)/);
  assert.match(route, /modelContext\.conversationContext/);
  assert.doesNotMatch(route, /Object\.entries\(context\.currentFiles\)/);
  assert.doesNotMatch(route, /context\.conversationContext/);
});

test('generation stream timeout measures inactivity instead of total duration', () => {
  assert.match(route, /AI_STREAM_TIMEOUT_MS \|\| 180000/);
  assert.match(route, /const attemptController = new AbortController\(\)/);
  assert.match(route, /refreshStreamInactivityTimeout/);
  assert.match(route, /streamOptions\.abortSignal = attemptController\.signal/);
  assert.doesNotMatch(route, /AbortSignal\.timeout\(providerTimeoutMs\)/);
});

test('generation and edit intent routes resolve only configured TR4 models', () => {
  assert.match(route, /resolveTeamModelRoute/);
  assert.match(route, /getLanguageModel/);
  assert.match(intentRoute, /resolveModelRoute\("intent"\)/);
  assert.match(route, /assertTr4Configured\(\)/);
  assert.match(intentRoute, /assertTr4Configured\(\)/);
  assert.doesNotMatch(route, /OPENCODEGO_API_KEY|opencodeClient|provider === 'opencode'/);
  assert.doesNotMatch(intentRoute, /OPENCODEGO_API_KEY|opencodeClient|provider === 'opencode'/);
});

test('generation route validates and repairs generated code before completion', () => {
  assert.match(route, /runGenerationQualityGate/);
  assert.match(route, /resolveTeamModelRoute\("qa", qaModel\)/);
  assert.match(route, /resolveModelRoute\("repair"\)/);
  assert.match(route, /type:\s*["']validation["']/);

  const qualityGateIndex = route.indexOf('runGenerationQualityGate({');
  const completeIndex = route.lastIndexOf("type: 'complete'");
  assert.ok(qualityGateIndex >= 0, 'quality gate invocation is present');
  assert.ok(completeIndex >= 0, 'complete event is present');
  assert.ok(qualityGateIndex < completeIndex, 'quality gate runs before completion');
});

test('generation route rebuilds approved files through the complete artifact parser', () => {
  assert.match(route, /import\s+\{[^}]*parseCompleteFileArtifact[^}]*\}\s+from ["']@\/lib\/generation\/tr4-quality-service["']/);
  assert.match(route, /const validatedFiles = parseCompleteFileArtifact\(generatedCode\)/);
  assert.doesNotMatch(route, /const validatedFileRegex = \/<file path=/);
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
