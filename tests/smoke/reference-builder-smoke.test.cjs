const assert = require('node:assert/strict');
const test = require('node:test');

const baseUrl = process.env.GSTUDIO_SMOKE_BASE_URL || 'http://localhost:9010';
const referenceUrl = process.env.GSTUDIO_SMOKE_REFERENCE_URL || 'https://example.com';

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

async function readSse(response) {
  assert.ok(response.body, 'Expected an SSE response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const records = buffer.split('\n\n');
    buffer = records.pop() || '';
    for (const record of records) {
      const dataLine = record.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      try { events.push(JSON.parse(dataLine.slice(6))); } catch { /* ignore keepalive fragments */ }
    }
    if (done) break;
  }
  return events;
}

async function runScenario({ label, intent, prompt, reference }) {
  const projectName = `Smoke Unified Reference ${label} ${Date.now()}`;
  let projectId = null;
  let sandboxId = null;
  try {
    const project = await request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        targetUrl: reference || 'scratch://new-project',
        style: '4',
      }),
    });
    assert.equal(project.response.ok, true, `project creation failed: ${JSON.stringify(project.body)}`);
    projectId = String(project.body.project.id);

    const sandbox = await request('/api/create-ai-sandbox-v2', {
      method: 'POST',
      body: JSON.stringify({ projectId, generationId: null, provider: 'e2b' }),
    });
    assert.equal(sandbox.response.ok, true, `sandbox creation failed: ${JSON.stringify(sandbox.body)}`);
    assert.equal(sandbox.body.success, true);
    sandboxId = sandbox.body.sandboxId;

    let brandGuidelines = null;
    if (reference) {
      const brand = await request('/api/extract-brand-styles', {
        method: 'POST',
        body: JSON.stringify({ url: reference, prompt }),
      });
      assert.equal(brand.response.ok, true, `reference extraction failed: ${JSON.stringify(brand.body)}`);
      brandGuidelines = brand.body;
    }

    const generationResponse = await fetch(`${baseUrl}/api/generate-ai-code-stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        generationIntent: intent,
        generationMode: 'build',
        context: {
          sandboxId,
          sandboxUrl: sandbox.body.url,
          referenceUrl: reference || null,
          brandGuidelines,
          conversationContext: { scrapedWebsites: [], generatedComponents: [], appliedCode: [] },
        },
      }),
    });
    assert.equal(generationResponse.ok, true, `generation request failed with ${generationResponse.status}`);
    const generationEvents = await readSse(generationResponse);
    const candidate = generationEvents.find((event) => event.type === 'candidate-ready');
    assert.ok(candidate, `${label}: candidate-ready was not emitted (${generationEvents.map((event) => event.type).join(', ')}): ${JSON.stringify(generationEvents.at(-1))}`);
    assert.equal(typeof candidate.generatedCode, 'string');

    const applyResponse = await fetch(`${baseUrl}/api/apply-ai-code-stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        response: candidate.generatedCode,
        isEdit: false,
        packages: [],
        sandboxId,
        generationContext: {
          projectId,
          mode: intent === 'scratch' ? 'scratch' : 'inspiration',
          prompt,
          targetUrl: reference || null,
          reference: reference ? {
            brandLanguage: {
              kind: 'brand-language-v1',
              artifactKey: `smoke-brand:${reference}`,
              sourceUrl: reference,
              capturedAt: new Date().toISOString(),
              evaluation: {
                passed: true,
                evidence: 'Smoke reference brand language is available for live validation.',
              },
            },
          } : undefined,
        },
      }),
    });
    assert.equal(applyResponse.ok, true, `apply request failed with ${applyResponse.status}`);
    const applyEvents = await readSse(applyResponse);
    const terminal = applyEvents.at(-1);
    assert.equal(terminal?.type, 'complete', `${label}: apply did not complete (${applyEvents.map((event) => event.type).join(', ')}): ${JSON.stringify(terminal)}`);

    return { label, generationEvents, applyEvents };
  } finally {
    await request('/api/kill-sandbox', { method: 'POST', body: '{}' }).catch(() => undefined);
    if (projectId) {
      await request(`/api/projects/${projectId}`, { method: 'DELETE', body: '{}' }).catch(() => undefined);
    }
  }
}

test('unified builder smoke scenarios reach candidate-ready then validated apply complete', { timeout: 900000 }, async () => {
  const scenarios = [
    {
      label: 'scratch',
      intent: 'scratch',
      prompt: 'Build a minimal original dark editorial workspace landing screen for a small research team. Keep the artifact to exactly src/index.css, src/App.jsx, and src/main.jsx. Use the existing Vite React runtime imports but add no new packages. Write plain CSS without @tailwind directives and put every color in CSS variables. Use exactly one h1, one paragraph, and one button; use no h2 headings, cards, lists, metrics, fabricated numbers, or named dashboard sections. Add a visible focus-visible style to the button.',
      reference: null,
    },
    {
      label: 'scratch-with-reference',
      intent: 'inspire',
      prompt: 'Build a minimal original event planning landing screen using the reference only for visual language; do not reproduce its copy, brand, or layout verbatim. Keep the artifact to exactly src/index.css, src/App.jsx, and src/main.jsx. Use the existing Vite React runtime imports but add no new packages. Write plain CSS without @tailwind directives and put every color in CSS variables. Use exactly one h1, one paragraph, and one button; use no h2 headings, cards, lists, metrics, fabricated numbers, or named dashboard sections. Add a visible focus-visible style to the button.',
      reference: referenceUrl,
    },
    {
      label: 'inspiration',
      intent: 'inspire',
      prompt: 'Create a minimal original knowledge-base landing screen with a calm editorial tone inspired by the visual direction of the reference. Keep the artifact to exactly src/index.css, src/App.jsx, and src/main.jsx. Use the existing Vite React runtime imports but add no new packages. Write plain CSS without @tailwind directives and put every color in CSS variables. Use exactly one h1, one paragraph, and one button; use no h2 headings, cards, lists, metrics, fabricated numbers, or named dashboard sections. Add a visible focus-visible style to the button.',
      reference: referenceUrl,
    },
  ];

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  const remaining = await request('/api/projects');
  assert.equal(remaining.response.ok, true);
  const leftovers = (remaining.body.projects || []).filter((project) => String(project.name).startsWith('Smoke Unified Reference '));
  assert.deepEqual(leftovers, []);
});
