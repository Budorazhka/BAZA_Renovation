import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * D-07 runtime release gate: Playwright driving REAL running HTTP processes
 * (api + marketplace-web + admin-web, backed by real MongoDB/Redis/MinIO) —
 * distinct from apps/api's mongodb-memory-server unit/integration tests.
 *
 * Orchestration: this config does NOT start servers itself (no `webServer`
 * block). See docs/operations/d07-runtime-e2e-gate.md "Orchestration" for
 * why: the chosen approach is `infrastructure/compose/compose.runtime.yml`
 * (primary) or compose.dev.yml + `pnpm --filter <app> dev` (lighter/faster
 * iteration), both started explicitly BEFORE this suite runs — reusing
 * docker compose's/Vite's own process supervision rather than reimplementing
 * it here. `globalSetup` below is the single gate that refuses a run against
 * incomplete infra; it is the thing responsible for "is everything already
 * up", not for starting anything itself.
 */
const MARKETPLACE_BASE_URL = process.env.RUNTIME_MARKETPLACE_URL || 'http://localhost:4173';

export default defineConfig({
  testDir: './src/specs',
  globalSetup: fileURLToPath(new URL('./src/global-setup.ts', import.meta.url)),
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Bounded, small retries — reserved for genuine service-startup/network
  // race conditions (a just-up container/dev-server still warming up, a
  // worker outbox poll landing between two poll intervals), never as a way
  // to paper over real assertion failures. See "Verification policy" in
  // docs/operations/runtime-release-gate.md.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: MARKETPLACE_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
});
