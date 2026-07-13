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

test('setupViteApp starts a managed Vite process without broad pkill', async () => {
  const provider = new E2BProvider({ e2b: { apiKey: 'test-key', timeoutMs: 1234 } });
  const backgroundHandle = { kill: async () => undefined };
  const commandCalls: Array<{ command: string; options: unknown }> = [];

  Object.assign(provider as unknown as Record<string, unknown>, {
    sandbox: {
      runCode: async () => ({ logs: { stdout: [], stderr: [] } }),
      commands: {
        run: async (command: string, options: unknown) => {
          commandCalls.push({ command, options });
          if (command.includes('pkill')) {
            throw new Error('broad pkill must not be used');
          }
          return backgroundHandle;
        },
      },
    },
    waitForViteReady: async () => undefined,
  });

  await provider.setupViteApp();

  assert.deepEqual(commandCalls, [
    {
      command: 'sudo chown -R user:user /home/user/app',
      options: { cwd: '/home/user/app' },
    },
    {
      command: 'npm run dev',
      options: { cwd: '/home/user/app', background: true },
    },
  ]);
  assert.equal((provider as unknown as { viteCommand: unknown }).viteCommand, backgroundHandle);
});

test('restartViteServer kills the tracked process before starting its replacement', async () => {
  const provider = new E2BProvider({ e2b: { apiKey: 'test-key', timeoutMs: 1234 } });
  let killCount = 0;
  const existingHandle = { kill: async () => { killCount += 1; } };
  const replacementHandle = { kill: async () => undefined };
  const commandCalls: Array<{ command: string; options: unknown }> = [];

  Object.assign(provider as unknown as Record<string, unknown>, {
    sandbox: {
      commands: {
        run: async (command: string, options: unknown) => {
          commandCalls.push({ command, options });
          if (command.includes('pkill')) {
            throw new Error('broad pkill must not be used');
          }
          return replacementHandle;
        },
      },
    },
    viteCommand: existingHandle,
    waitForViteReady: async () => undefined,
  });

  await provider.restartViteServer();

  assert.equal(killCount, 1);
  assert.deepEqual(commandCalls, [
    {
      command: 'npm run dev',
      options: { cwd: '/home/user/app', background: true },
    },
  ]);
  assert.equal((provider as unknown as { viteCommand: unknown }).viteCommand, replacementHandle);
});
