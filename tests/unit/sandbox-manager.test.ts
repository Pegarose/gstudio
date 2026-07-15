import assert from 'node:assert/strict';
import test from 'node:test';
import { SandboxFactory } from '../../lib/sandbox/factory';
import { sandboxManager } from '../../lib/sandbox/sandbox-manager';

test('sandbox manager reconnects by capability instead of production class name', async () => {
  const originalCreate = SandboxFactory.create;
  const sandboxId = `minified-e2b-${Date.now()}`;
  let reconnectCalls = 0;
  const provider = {
    reconnect: async (requestedId: string) => {
      reconnectCalls += 1;
      assert.equal(requestedId, sandboxId);
      return true;
    },
    terminate: async () => undefined,
  };

  Object.defineProperty(SandboxFactory, 'create', {
    configurable: true,
    value: () => provider,
  });

  try {
    const resolved = await sandboxManager.getOrCreateProvider(sandboxId);

    assert.equal(reconnectCalls, 1);
    assert.equal(resolved, provider);
    assert.equal(sandboxManager.getProvider(sandboxId), provider);
  } finally {
    await sandboxManager.terminateSandbox(sandboxId);
    Object.defineProperty(SandboxFactory, 'create', {
      configurable: true,
      value: originalCreate,
    });
  }
});

test('sandbox manager allocates and registers providers for the shared apply lifecycle', async () => {
  const originalCreate = SandboxFactory.create;
  const sandboxId = `allocated-e2b-${Date.now()}`;
  const provider = {
    createSandbox: async () => ({
      sandboxId,
      url: `https://5173-${sandboxId}.e2b.app`,
      provider: 'e2b' as const,
      createdAt: new Date(),
    }),
    terminate: async () => undefined,
  };

  Object.defineProperty(SandboxFactory, 'create', {
    configurable: true,
    value: () => provider,
  });

  try {
    const info = await sandboxManager.allocate('e2b');

    assert.equal(info.sandboxId, sandboxId);
    assert.equal(sandboxManager.getProvider(sandboxId), provider);
  } finally {
    await sandboxManager.terminateSandbox(sandboxId);
    Object.defineProperty(SandboxFactory, 'create', {
      configurable: true,
      value: originalCreate,
    });
  }
});
