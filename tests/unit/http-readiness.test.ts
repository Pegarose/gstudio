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

