const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const dashboard = readFileSync(resolve(__dirname, '../app/page.tsx'), 'utf8');
const builder = readFileSync(resolve(__dirname, '../app/generation/page.tsx'), 'utf8');
const route = readFileSync(resolve(__dirname, '../app/api/generate-ai-code-stream/route.ts'), 'utf8');

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
  assert.match(route, /AbortSignal\.timeout\(providerTimeoutMs\)/);
  assert.match(route, /AI_STREAM_TIMEOUT_MS/);
  assert.doesNotMatch(route, /\.agents\/skills/);
  assert.doesNotMatch(route, /AGENTS\.md CORE SYSTEM RULES/);
});
