/**
 * Hand-written type surface for scripts/runtime/preflight.mjs (a plain JS
 * ESM module, deliberately outside this package so both the standalone CLI
 * and this Playwright suite share exactly one implementation — see that
 * file's own docblock). TypeScript cannot infer .mjs exports across a
 * relative import without a declaration; kept minimal and hand-synced with
 * the real return shape of `runPreflight()`.
 */
export interface PreflightCheckResult {
  label: string;
  ok: boolean;
  status?: number;
  detail?: string;
  error?: string;
  remediation?: string;
}

export interface PreflightReport {
  ok: boolean;
  status: 'READY' | 'BLOCKED_INFRASTRUCTURE';
  packageManagerPin?: string;
  results: PreflightCheckResult[];
}
