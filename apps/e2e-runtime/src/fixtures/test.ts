import { test as base, expect } from '@playwright/test';
import { env } from './env';
import { seedAdminAccount, type SeededAdmin } from './seed-admin';
import { uniqueLogin, STRONG_TEST_PASSWORD } from './test-data';

/**
 * Project-wide custom fixtures. The global infra gate itself lives in
 * playwright.config.ts's `globalSetup` (runs once for the whole run, before
 * any test file is even loaded) — that is what refuses BLOCKED_INFRASTRUCTURE
 * runs outright. The fixtures here are per-test conveniences layered on top
 * of an already-confirmed-healthy environment: they do not re-run the infra
 * gate (that would be redundant per-test cost for zero extra safety, since
 * globalSetup already throws for the whole run before this file's fixtures
 * are ever instantiated).
 */
export interface Fixtures {
  seededSuperAdmin: SeededAdmin;
  seedScopedAdmin: (label: string) => Promise<SeededAdmin>;
}

export const test = base.extend<Fixtures>({
  // A fresh super_admin, seeded once per test via the direct-Mongo fixture
  // (see fixtures/seed-admin.ts docblock for why this bypass exists and
  // exactly what it mirrors). Unique login per test — never shared/reused
  // across tests, so tests can run in any order/in parallel without
  // colliding on the same admin account's state.
  // eslint-disable-next-line no-empty-pattern
  seededSuperAdmin: async ({}, use, testInfo) => {
    const admin = await seedAdminAccount(env.mongoUri, {
      login: uniqueLogin(`super-admin-${testInfo.testId}`),
      password: STRONG_TEST_PASSWORD,
      isSuperAdmin: true,
    });
    await use(admin);
  },

  // Factory fixture for tests that additionally need a second, non-super
  // admin account (scoped-vs-super-admin behavior difference scenarios).
  // eslint-disable-next-line no-empty-pattern
  seedScopedAdmin: async ({}, use, testInfo) => {
    await use(async (label: string) =>
      seedAdminAccount(env.mongoUri, {
        login: uniqueLogin(`scoped-admin-${label}-${testInfo.testId}`),
        password: STRONG_TEST_PASSWORD,
        isSuperAdmin: false,
      }),
    );
  },
});

export { expect };
