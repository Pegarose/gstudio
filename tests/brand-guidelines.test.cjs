const assert = require('node:assert/strict');
const test = require('node:test');

test('brand typography normalization rejects heading-sized body text', async () => {
  const { normalizeBrandGuidelines } = await import('../lib/brand-guidelines.js');
  const normalized = normalizeBrandGuidelines({
    typography: {
      fontSizes: { h1: '68px', h2: '53px', body: '68px' },
      fontFamilies: { primary: 'Figtree', heading: 'Oxygen' }
    }
  });

  assert.equal(normalized.typography.fontSizes.h1, '68px');
  assert.equal(normalized.typography.fontSizes.h2, '53px');
  assert.equal(normalized.typography.fontSizes.body, '16px');
});

test('brand typography normalization preserves plausible body sizes', async () => {
  const { normalizeBrandGuidelines } = await import('../lib/brand-guidelines.js');
  const normalized = normalizeBrandGuidelines({ typography: { fontSizes: { body: '18px' } } });
  assert.equal(normalized.typography.fontSizes.body, '18px');
});

