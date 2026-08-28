import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  api: 'http://localhost:3000',
  marketplace: 'http://localhost:4173',
  erp: 'http://localhost:4174',
};

function withPath(origin, path) {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

export async function checkEndpoint(label, url, { fetcher = fetch, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, { signal: controller.signal });
    return { label, url, ok: response.ok, status: response.status };
  } catch (error) {
    return {
      label,
      url,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyRuntime({ env = process.env, fetcher = fetch } = {}) {
  const api = env.RUNTIME_API_URL || DEFAULTS.api;
  const marketplace = env.RUNTIME_MARKETPLACE_URL || DEFAULTS.marketplace;
  const erp = env.RUNTIME_ERP_URL || DEFAULTS.erp;

  return Promise.all([
    checkEndpoint('api liveness', withPath(api, '/health'), { fetcher }),
    checkEndpoint('api readiness', withPath(api, '/health/ready'), { fetcher }),
    checkEndpoint('marketplace web', marketplace, { fetcher }),
    checkEndpoint('erp web', erp, { fetcher }),
  ]);
}

function printResults(results) {
  for (const result of results) {
    if (result.ok) {
      console.log(`[runtime] PASS ${result.label} (${result.status}) ${result.url}`);
    } else {
      const reason = result.status ? `HTTP ${result.status}` : result.error || 'unknown error';
      console.error(`[runtime] FAIL ${result.label}: ${reason} ${result.url}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const results = await verifyRuntime();
  printResults(results);
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}
