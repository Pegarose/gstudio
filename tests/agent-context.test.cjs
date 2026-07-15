const assert = require('node:assert/strict');
const test = require('node:test');

test('canonical G Studio context loads from gstudio-agent-context', async () => {
  const context = await import('../lib/gstudio-agent-context.js');
  const loaded = context.loadAgentContext({
    intent: 'inspire',
    prompt: 'businesswire.com sitesinden ilham al'
  });

  assert.equal(loaded.intent, 'inspire');
  assert.match(loaded.systemPrompt, /Your output must look MADE, not GENERATED/);
  assert.deepEqual(loaded.skills, ['design-core', 'design-intelligence', 'brand-extract']);
  assert.match(loaded.skillPrompt, /SKILL: brand-extract/);
  assert.doesNotMatch(loaded.skillPrompt, /SKILL: clone-fidelity/);
});

test('reference intent normalizes URL work to inspiration and keeps scratch explicit', async () => {
  const { resolveGenerationIntent } = await import('../lib/gstudio-agent-context.js');

  assert.equal(resolveGenerationIntent({ instructions: 'BusinessWire sitesinden ilham al' }), 'inspire');
  assert.equal(resolveGenerationIntent({ instructions: 'Use the visual language of https://businesswire.com' }), 'inspire');
  assert.equal(resolveGenerationIntent({ instructions: 'Clone https://businesswire.com' }), 'inspire');
  assert.equal(resolveGenerationIntent({ url: 'https://businesswire.com' }), 'inspire');
  assert.equal(resolveGenerationIntent({ explicitIntent: 'scratch' }), 'scratch');
  assert.equal(resolveGenerationIntent({ url: 'scratch://new-project' }), 'scratch');
});

test('generic component wording in a full-page inspiration prompt does not activate component-scope', async () => {
  const { loadAgentContext } = await import('../lib/gstudio-agent-context.js');
  const loaded = loadAgentContext({
    intent: 'inspire',
    prompt: 'Build a NEW React component/application. Create an original premium corporate newsroom with a refined news feed and responsive interactions.'
  });

  assert.deepEqual(loaded.skills, ['design-core', 'design-intelligence', 'brand-extract']);
});

test('explicit scratch file contracts skip page-template skills', async () => {
  const { loadAgentContext } = await import('../lib/gstudio-agent-context.js');
  const loaded = loadAgentContext({
    intent: 'scratch',
    prompt: 'Create exactly two files only: src/App.jsx and src/index.css. Do not add any other files or sections.'
  });

  assert.deepEqual(loaded.skills, []);
  assert.doesNotMatch(loaded.skillPrompt, /SKILL: DESIGN-CORE/);
});
