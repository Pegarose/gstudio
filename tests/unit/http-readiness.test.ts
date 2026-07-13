import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForHttpReady } from '../../lib/sandbox/readiness/http-readiness';

test('readiness returns the last observed error on timeout', async () => {
  const result = await waitForHttpReady({
    url: 'http://127.0.0.1:1',
    timeoutMs: 25,
    intervalMs: 5,
    fetchImpl: async () => { throw new Error('connection refused'); },
  });

  assert.equal(result.ready, false);
  assert.match(result.lastError ?? '', /connection refused/);
});

test('readiness aborts a never-resolving fetch by the global deadline', async () => {
  let aborted = false;
  const fetchImpl: typeof fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('request aborted by readiness timeout'));
    }, { once: true });
  });
  const startedAt = Date.now();

  const result = await waitForHttpReady({
    url: 'http://127.0.0.1:1',
    timeoutMs: 25,
    intervalMs: 1,
    fetchImpl,
  });

  assert.equal(result.ready, false);
  assert.equal(aborted, true);
  assert.match(result.lastError ?? '', /aborted|timed out|timeout/i);
  assert.ok(Date.now() - startedAt < 250, 'readiness should not hang after its deadline');
});
