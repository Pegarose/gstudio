const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const routePath = resolve(__dirname, '../app/api/kill-sandbox/route.ts');

function loadRoute(sandboxManager) {
  const source = readFileSync(routePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2017,
    },
  }).outputText;
  const module = { exports: {} };
  const requireRouteDependency = (id) => {
    if (id === 'next/server') {
      return { NextResponse: { json: (body, init = {}) => ({ body, ...init }) } };
    }
    if (id === '@/lib/sandbox/sandbox-manager') {
      return { sandboxManager };
    }
    throw new Error(`Unexpected route dependency: ${id}`);
  };

  new Function('exports', 'require', 'module', compiled)(module.exports, requireRouteDependency, module);
  return module.exports;
}

test('POST terminates a sandbox registered with the sandbox manager', async () => {
  let managerTerminations = 0;
  let providerTerminations = 0;
  const provider = {
    terminate: async () => {
      providerTerminations += 1;
    },
  };
  const sandboxManager = {
    getActiveProvider: () => provider,
    terminateAll: async () => {
      managerTerminations += 1;
      await provider.terminate();
    },
  };
  const previousProvider = global.activeSandboxProvider;
  const previousSandboxData = global.sandboxData;
  const previousFiles = global.existingFiles;

  global.activeSandboxProvider = provider;
  global.sandboxData = { sandboxId: 'test-sandbox' };
  global.existingFiles = new Set(['src/App.jsx']);

  try {
    const { POST } = loadRoute(sandboxManager);
    const response = await POST();

    assert.equal(managerTerminations, 1);
    assert.equal(providerTerminations, 1);
    assert.equal(response.body.sandboxKilled, true);
    assert.equal(global.activeSandboxProvider, null);
    assert.equal(global.sandboxData, null);
    assert.equal(global.existingFiles.size, 0);
  } finally {
    global.activeSandboxProvider = previousProvider;
    global.sandboxData = previousSandboxData;
    global.existingFiles = previousFiles;
  }
});
