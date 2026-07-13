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
