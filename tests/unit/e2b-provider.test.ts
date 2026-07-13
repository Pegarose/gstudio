import assert from 'node:assert/strict';
import test from 'node:test';
import { Sandbox } from '@e2b/code-interpreter';
import { E2BProvider } from '../../lib/sandbox/providers/e2b-provider';

test('reconnect stores the durable E2B sandbox and refreshes sandbox info', async () => {
  const originalConnect = Sandbox.connect;
  const connected = {
    getInfo: async () => ({ startedAt: '2026-07-13T10:00:00.000Z' }),
    getHost: (port: number) => `sandbox-${port}.e2b.app`,
  };
  let connectArgs: unknown[] = [];
  Object.defineProperty(Sandbox, 'connect', {
    configurable: true,
    value: async (...args: unknown[]) => {
      connectArgs = args;
      return connected;
    },
  });

  try {
    const provider = new E2BProvider({ e2b: { apiKey: 'test-key', timeoutMs: 1234 } });
    assert.equal(await provider.reconnect('sandbox-1'), true);
    assert.deepEqual(connectArgs, ['sandbox-1', { timeoutMs: 1234 }]);
    assert.equal(provider.getSandboxInfo()?.sandboxId, 'sandbox-1');
    assert.equal(provider.getSandboxInfo()?.url, 'https://sandbox-5173.e2b.app');
    assert.equal(provider.isAlive(), true);
  } finally {
    Object.defineProperty(Sandbox, 'connect', { configurable: true, value: originalConnect });
  }
});

