const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const builderPage = resolve(__dirname, '../app/generation/page.tsx');

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
