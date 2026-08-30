#!/usr/bin/env node
/**
 * D-07 runtime release gate preflight.
 *
 * Independently verifies every piece of infrastructure the Playwright
 * runtime E2E suite (apps/e2e-runtime) needs before it is allowed to run:
 * Node/pnpm tooling, Docker daemon availability, and real reachability of
 * api / marketplace-web / admin-web / MongoDB / Redis / MinIO.
 *
 * This intentionally does NOT trust apps/api's own GET /health/ready as the
 * sole signal — that endpoint only checks Mongo (see health.controller.ts
 * comment: Redis/MinIO checks are deliberately out of scope there). This
 * script probes Mongo, Redis and MinIO itself, independently of the API
 * process, so a false-"ready" API can never mask a broken dependency.
 *
 * On any missing/unreachable piece this script:
 *   - exits with a non-zero code,
 *   - prints a status line containing the literal string
 *     "BLOCKED_INFRASTRUCTURE",
 *   - lists every failed check with a concrete remediation command.
 *
 * It never fabricates a PASS. If Docker/Mongo/Redis/MinIO/apps are not
 * reachable in the current environment, that is reported honestly — see
 * docs/operations/runtime-release-gate.md "Verification policy" and
 * docs/operations/d07-runtime-e2e-gate.md "Known limitations".
 *
 * Usable two ways:
 *   1. Standalone CLI: `node scripts/runtime/preflight.mjs`
 *   2. Imported as a library from Playwright globalSetup
 *      (apps/e2e-runtime/src/global-setup.ts), which calls `runPreflight()`
 *      and throws on any failure so Playwright reports a hard failure, never
 *      a misleading green run.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// DEP0190 ("args with shell:true") is Node flagging a risk that does not
// apply here — every execCli() call site below passes a fixed, hardcoded
// argument list, never anything derived from external/user input — so this
// narrowly silences that one warning code to keep CI output honest-signal
// (real failures) rather than noisy, without silencing other deprecations.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.code === 'DEP0190') return;
  console.warn(warning);
});

/**
 * Cross-platform CLI invocation. On win32, PATH executables for
 * Node-ecosystem tools (pnpm, npm, corepack...) are commonly `.cmd` shims —
 * these are not real Windows PE executables, so `execFile` cannot spawn
 * them at all without a shell (fails with EINVAL/ENOENT regardless of exact
 * extension guessing; this is a documented Node/Windows limitation, not a
 * fixable path-resolution bug). `shell: true` is required there. Node's
 * args-with-shell deprecation warning (DEP0190) exists to flag unescaped
 * *user-controlled* input reaching a shell — every call site in this file
 * passes a fixed, hardcoded argument list (never anything derived from
 * external input), so the underlying risk the warning targets does not
 * apply here; args are still passed as an array (not shell-concatenated by
 * hand) to keep Node's own quoting for the win32 shell path.
 */
function execCli(command, args, options) {
  const useShell = process.platform === 'win32';
  return execFileAsync(command, args, { ...options, shell: useShell });
}

const DEFAULTS = {
  api: 'http://localhost:3000',
  marketplace: 'http://localhost:4173',
  admin: 'http://localhost:4174',
  mongoHost: 'localhost',
  mongoPort: 27017,
  redisHost: 'localhost',
  redisPort: 6379,
  redisPassword: 'dev_redis_password',
  minio: 'http://localhost:9000',
};

/** Minimum Node major version this repo supports (root package.json engines.node). */
const MIN_NODE_MAJOR = 20;

function withPath(origin, path) {
  return `${origin.replace(/\/+$/, '')}${path}`;
}

// ---------------------------------------------------------------------------
// HTTP endpoint checks (api liveness/readiness, marketplace-web, admin-web,
// MinIO liveness) — kept as a small reusable primitive, same shape the
// pre-existing verify-runtime.mjs test suite already exercises.
// ---------------------------------------------------------------------------
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

/**
 * Node's `net` connect errors (e.g. ECONNREFUSED on Windows) frequently
 * carry an empty `.message` with the real information only in `.code` —
 * this normalizes both shapes into something a human can actually act on.
 */
function describeNetError(error) {
  if (!(error instanceof Error)) return String(error);
  const code = /** @type {NodeJS.ErrnoException} */ (error).code;
  if (error.message && error.message.trim()) return error.message;
  if (code) return code;
  return 'unknown network error';
}

/**
 * Real TCP-level reachability check, no protocol handshake — used as the
 * basis for the MongoDB check below. A bare TCP connect is enough to prove
 * "something is listening on this host:port", which is already strictly
 * more than trusting a downstream HTTP endpoint's opinion.
 */
function checkTcp(label, host, port, { timeoutMs = 3000 } = {}) {
  return new Promise((resolvePromise) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolvePromise({ label, ok: false, error: `TCP connect to ${host}:${port} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolvePromise({ label, ok: true });
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ label, ok: false, error: describeNetError(error) });
    });
  });
}

/**
 * MongoDB check: real TCP connect to the configured host:port. A raw TCP
 * connect (rather than pulling in a full `mongodb`/`mongoose` driver
 * connection just for a health probe) is deliberately chosen here — it is
 * dependency-free, fast, and sufficient to prove "mongod is listening",
 * which is exactly what this preflight needs to distinguish "container not
 * running" from "container running but API misconfigured". The Playwright
 * suite's own seed script (apps/e2e-runtime/src/fixtures/seed-admin.ts)
 * additionally does a real `mongoose.connect()` + write, which is a strictly
 * stronger check executed later in the same run.
 */
async function checkMongo(env) {
  const host = env.RUNTIME_MONGO_HOST || DEFAULTS.mongoHost;
  const port = Number(env.RUNTIME_MONGO_PORT || DEFAULTS.mongoPort);
  const result = await checkTcp('mongodb (tcp)', host, port);
  return { ...result, remediation: 'docker compose -f infrastructure/compose/compose.runtime.yml up -d mongodb' };
}

/**
 * Redis check: real TCP connect + a real RESP PING/PONG round-trip
 * (authenticated with REDIS_PASSWORD when set) — not just a bare TCP
 * connect, so a wrong password or a non-Redis process squatting on the port
 * is caught here. No `ioredis`/`redis` npm dependency needed: the RESP
 * protocol for AUTH+PING is two trivial inline commands, hand-rolled below.
 */
function checkRedis(env) {
  const host = env.RUNTIME_REDIS_HOST || DEFAULTS.redisHost;
  const port = Number(env.RUNTIME_REDIS_PORT || DEFAULTS.redisPort);
  const password = env.REDIS_PASSWORD || DEFAULTS.redisPassword;
  const remediation = 'docker compose -f infrastructure/compose/compose.runtime.yml up -d redis';

  return new Promise((resolvePromise) => {
    const socket = netConnect({ host, port });
    let buffer = '';
    let settled = false;
    const timeoutMs = 3000;
    const timer = setTimeout(() => {
      socket.destroy();
      finish({ ok: false, error: `Redis PING timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolvePromise({ label: 'redis (ping)', remediation, ...result });
    }

    socket.once('error', (error) => {
      finish({ ok: false, error: describeNetError(error) });
    });

    socket.once('connect', () => {
      // Inline command form (not RESP arrays) is accepted by real Redis for
      // simple commands and is sufficient for a health probe.
      socket.write(`AUTH ${password}\r\nPING\r\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.includes('PONG')) {
        finish({ ok: true });
      } else if (buffer.includes('-ERR') || buffer.includes('-WRONGPASS') || buffer.includes('-NOAUTH')) {
        finish({ ok: false, error: `Redis rejected AUTH/PING: ${buffer.trim()}` });
      }
    });

    socket.once('close', () => {
      // Connection closed without ever seeing PONG/-ERR — either a
      // non-Redis process is listening on this port, or it closed the
      // connection before replying. `finish()` is a no-op if a result was
      // already produced (timer/data handlers above already cleared it).
      finish({ ok: false, error: buffer ? `Unexpected Redis response before close: ${buffer.trim()}` : 'Connection closed before a PONG/-ERR reply (not a Redis server on this port?)' });
    });
  });
}

/**
 * MinIO check: real HTTP GET against MinIO's own `/minio/health/live`
 * liveness endpoint (the same one compose.runtime.yml's healthcheck uses) —
 * a genuine MinIO-specific signal, not a generic TCP connect, so a
 * different service accidentally bound to port 9000 would still fail here.
 */
async function checkMinio(env, { fetcher = fetch } = {}) {
  const origin = env.RUNTIME_MINIO_URL || DEFAULTS.minio;
  const result = await checkEndpoint('minio (/minio/health/live)', withPath(origin, '/minio/health/live'), { fetcher });
  return { ...result, remediation: 'docker compose -f infrastructure/compose/compose.runtime.yml up -d minio' };
}

/**
 * Docker daemon check: `docker version` exits non-zero (or the binary is
 * missing entirely) when no daemon is reachable — this is the ground-truth
 * signal this whole gate depends on to distinguish "infra just needs
 * starting" from "infra fundamentally cannot be started here".
 */
async function checkDocker() {
  try {
    await execCli('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000 });
    return { label: 'docker daemon', ok: true };
  } catch (error) {
    return {
      label: 'docker daemon',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      remediation: 'Start Docker Desktop (or the Docker daemon), then re-run this preflight.',
    };
  }
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  const ok = major >= MIN_NODE_MAJOR;
  return {
    label: `node >= ${MIN_NODE_MAJOR}`,
    ok,
    detail: `running node ${process.versions.node}`,
    remediation: ok ? undefined : `Install Node.js >= ${MIN_NODE_MAJOR} (root package.json engines.node) and re-run.`,
  };
}

async function checkPnpm() {
  try {
    const { stdout } = await execCli('pnpm', ['--version'], { timeout: 5000 });
    return { label: 'pnpm available', ok: true, detail: `pnpm ${stdout.trim()}` };
  } catch (error) {
    return {
      label: 'pnpm available',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      remediation: 'Install pnpm (root package.json packageManager pins pnpm@11.23.0), e.g. `corepack enable && corepack prepare pnpm@11.23.0 --activate`.',
    };
  }
}

function readPackageManagerPin() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return pkg.packageManager;
  } catch {
    return undefined;
  }
}

/**
 * Runs every independent check and returns a single structured report.
 * Never throws for expected infra-missing conditions — only for genuine
 * programming errors — so callers (CLI main() below, and Playwright
 * globalSetup) can decide what to do with a failed report themselves.
 */
export async function runPreflight({ env = process.env, fetcher = fetch } = {}) {
  const api = env.RUNTIME_API_URL || DEFAULTS.api;
  const marketplace = env.RUNTIME_MARKETPLACE_URL || DEFAULTS.marketplace;
  const admin = env.RUNTIME_ADMIN_URL || DEFAULTS.admin;

  const [nodeCheck, pnpmCheck, dockerCheck, mongoCheck, redisCheck, minioCheck, apiLiveness, apiReadiness, marketplaceWeb, adminWeb] =
    await Promise.all([
      Promise.resolve(checkNodeVersion()),
      checkPnpm(),
      checkDocker(),
      checkMongo(env),
      checkRedis(env),
      checkMinio(env, { fetcher }),
      checkEndpoint('api liveness (/health)', withPath(api, '/health'), { fetcher }).then((r) => withRemediation(r, 'pnpm runtime:up  (or: pnpm --filter api dev)')),
      checkEndpoint('api readiness (/health/ready)', withPath(api, '/health/ready'), { fetcher }).then((r) =>
        withRemediation(r, 'Check `docker compose -f infrastructure/compose/compose.runtime.yml logs api mongodb` — readiness requires Mongo replSet up.'),
      ),
      checkEndpoint('marketplace-web (root)', marketplace, { fetcher }).then((r) => withRemediation(r, 'pnpm runtime:up  (or: pnpm --filter marketplace-web dev -- --port 4173)')),
      checkEndpoint('admin-web (root)', admin, { fetcher }).then((r) => withRemediation(r, 'pnpm runtime:up  (or: pnpm --filter admin-web dev -- --port 4174)')),
    ]);

  const results = [
    nodeCheck,
    pnpmCheck,
    dockerCheck,
    mongoCheck,
    redisCheck,
    minioCheck,
    apiLiveness,
    apiReadiness,
    marketplaceWeb,
    adminWeb,
  ];

  const allOk = results.every((r) => r.ok);

  return {
    ok: allOk,
    status: allOk ? 'READY' : 'BLOCKED_INFRASTRUCTURE',
    packageManagerPin: readPackageManagerPin(),
    results,
  };
}

function withRemediation(result, remediation) {
  return result.ok ? result : { ...result, remediation };
}

function printReport(report) {
  console.log(`[preflight] status: ${report.status}`);
  if (report.packageManagerPin) {
    console.log(`[preflight] expected packageManager: ${report.packageManagerPin}`);
  }
  console.log('');

  for (const result of report.results) {
    if (result.ok) {
      const extra = result.detail ? ` (${result.detail})` : result.status ? ` (${result.status})` : '';
      console.log(`[preflight] PASS ${result.label}${extra}`);
    } else {
      const reason = result.status ? `HTTP ${result.status}` : result.error || 'unknown failure';
      console.error(`[preflight] FAIL ${result.label}: ${reason}`);
      if (result.remediation) {
        console.error(`             remediation: ${result.remediation}`);
      }
    }
  }

  console.log('');
  if (report.ok) {
    console.log('[preflight] All checks passed. Runtime infrastructure is ready for the D-07 Playwright suite.');
  } else {
    const failed = report.results.filter((r) => !r.ok).map((r) => r.label);
    console.error(`[preflight] BLOCKED_INFRASTRUCTURE — ${failed.length} check(s) failed: ${failed.join(', ')}`);
    console.error('[preflight] The Playwright runtime E2E suite (apps/e2e-runtime) refuses to run against incomplete infrastructure.');
    console.error('[preflight] This is an honest infrastructure gap, not a test failure — see docs/operations/d07-runtime-e2e-gate.md "Known limitations".');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const report = await runPreflight();
  printReport(report);
  process.exitCode = report.ok ? 0 : 1;
}
