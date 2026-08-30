// @ts-expect-error — scripts/runtime/preflight.mjs is plain JS outside this
// package (deliberately shared, single source of truth with the standalone
// CLI); see src/preflight-types.ts for the hand-synced type surface used
// below via an explicit cast.
import { runPreflight as runPreflightUntyped } from '../../../scripts/runtime/preflight.mjs';
import type { PreflightReport } from './preflight-types';

const runPreflight = runPreflightUntyped as () => Promise<PreflightReport>;

/**
 * Playwright globalSetup — the single gate that decides whether this suite
 * is allowed to run at all. Reuses the exact same `runPreflight()` used by
 * `node scripts/runtime/preflight.mjs` (root `pnpm runtime:preflight`), so
 * there is one source of truth for "is the infrastructure actually up",
 * not a second, possibly-diverging copy embedded in the Playwright config.
 *
 * Throwing here makes Playwright itself report a hard failure for the
 * whole run (visible in both the list reporter and the HTML report) — it
 * does NOT let individual tests silently skip while the run as a whole
 * reports green. This is the mechanism the task explicitly requires: a
 * missing/incomplete environment must never look like a passing suite.
 */
export default async function globalSetup(): Promise<void> {
  const report = await runPreflight();

  for (const result of report.results) {
    const line = result.ok
      ? `[global-setup] PASS ${result.label}`
      : `[global-setup] FAIL ${result.label}: ${result.status ? `HTTP ${result.status}` : result.error}`;
    // eslint-disable-next-line no-console
    console.log(line);
  }

  if (!report.ok) {
    const failed = report.results.filter((r) => !r.ok);
    const remediation = failed
      .map((r) => `  - ${r.label}: ${r.remediation ?? 'no remediation documented'}`)
      .join('\n');

    throw new Error(
      [
        'BLOCKED_INFRASTRUCTURE — D-07 Playwright runtime suite refuses to run.',
        `${failed.length} preflight check(s) failed:`,
        remediation,
        '',
        'This is an honest infrastructure gap, not a test failure. See',
        'docs/operations/d07-runtime-e2e-gate.md "Known limitations" and',
        'docs/operations/runtime-release-gate.md "Verification policy".',
      ].join('\n'),
    );
  }
}
