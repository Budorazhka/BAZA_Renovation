import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEndpoint, verifyRuntime } from './verify-runtime.mjs';

test('checkEndpoint reports successful HTTP responses', async () => {
  const result = await checkEndpoint('api', 'http://api.test/health', {
    fetcher: async () => new Response('ok', { status: 200 }),
  });

  assert.deepEqual(result, {
    label: 'api',
    url: 'http://api.test/health',
    ok: true,
    status: 200,
  });
});

test('checkEndpoint reports HTTP failures and transport errors', async () => {
  const httpFailure = await checkEndpoint('web', 'http://web.test', {
    fetcher: async () => new Response('unavailable', { status: 503 }),
  });
  assert.equal(httpFailure.ok, false);
  assert.equal(httpFailure.status, 503);

  const transportFailure = await checkEndpoint('api', 'http://api.test', {
    fetcher: async () => { throw new Error('connection refused'); },
  });
  assert.equal(transportFailure.ok, false);
  assert.equal(transportFailure.error, 'connection refused');
});

test('verifyRuntime checks API and both web origins with defaults', async () => {
  const requested = [];
  const results = await verifyRuntime({
    env: {},
    fetcher: async (url) => {
      requested.push(url);
      return new Response('', { status: 200 });
    },
  });

  assert.deepEqual(requested, [
    'http://localhost:3000/health',
    'http://localhost:3000/health/ready',
    'http://localhost:4173',
    'http://localhost:4174',
  ]);
  // 4173 == marketplace-web, 4174 == admin-web (ADMIN_WEB replaces the
  // stale ERP_WEB default previously at the same port — apps/erp-web does
  // not exist in this worktree).
  assert.equal(results.every((result) => result.ok), true);
});
