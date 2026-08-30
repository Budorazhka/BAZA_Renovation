import { test, expect } from '../fixtures/test';
import { env } from '../fixtures/env';
import { adminApiClient } from '../fixtures/api-clients';

/**
 * Admin panel: login (seeded super_admin, see fixtures/seed-admin.ts for
 * why a direct-Mongo seed is required and what it mirrors), scoped-admin
 * vs super_admin behavior difference, deactivate/reactivate an admin
 * account, revoke a grant (409 on stale expectedVersion, 200 on correct
 * one), audit trail shows the actions just performed, and admin protected
 * routes reject after logout.
 *
 * Every admin account used here is seeded fresh per test (unique login via
 * fixtures/test-data.ts) — no shared/reused fixture state across tests, no
 * teardown needed beyond what each scenario does to its own account as
 * part of the assertions themselves (deactivate/revoke ARE the scenario).
 */
test.describe('admin panel', () => {
  test('super_admin can log in via the UI and sees /admin/me-derived role', async ({ page, seededSuperAdmin }) => {
    await page.goto('/login');
    await page.getByLabel('Логин').fill(seededSuperAdmin.login);
    await page.getByLabel('Пароль').fill(seededSuperAdmin.password);

    const meResponsePromise = page.waitForResponse((res) => res.url().endsWith('/admin/me') && res.request().method() === 'GET');
    await page.getByRole('button', { name: 'Войти' }).click();

    await expect(page).toHaveURL(/\/publications$/);
    const meResponse = await meResponsePromise;
    expect(meResponse.status()).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.isSuperAdmin).toBe(true);
    expect(meBody.adminAccountId).toBe(seededSuperAdmin.adminAccountId);

    await expect(page.locator('.session-role')).toHaveText('super_admin');
    await expect(page.getByRole('link', { name: 'Аккаунты' })).toBeVisible();
  });

  test('a scoped (non-super) admin cannot see the Accounts nav link and is blocked from account creation', async ({
    page,
    seedScopedAdmin,
  }) => {
    const scopedAdmin = await seedScopedAdmin('nav-visibility');

    await page.goto('/login');
    await page.getByLabel('Логин').fill(scopedAdmin.login);
    await page.getByLabel('Пароль').fill(scopedAdmin.password);
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page).toHaveURL(/\/publications$/);

    await expect(page.locator('.session-role')).toHaveText('admin');
    await expect(page.getByRole('link', { name: 'Аккаунты' })).toHaveCount(0);

    // Directly navigating to the super_admin-only route must render the
    // real client-side scope guard's rejection, not the accounts screen.
    await page.goto('/accounts');
    await expect(page.getByText('Раздел доступен только super_admin.')).toBeVisible();
  });

  test('a scoped admin gets a real 403 from the server on a super_admin-only route (account creation)', async ({
    request,
    seedScopedAdmin,
  }) => {
    const scopedAdmin = await seedScopedAdmin('server-403');
    const admin = adminApiClient(request);

    const loginResult = await admin.login(scopedAdmin.login, scopedAdmin.password);
    expect(loginResult.status).toBe(200);

    const meResult = await admin.me();
    expect(meResult.status).toBe(200);
    expect(meResult.body.isSuperAdmin).toBe(false);

    // AdminAccountService.requireSuperAdmin -> SELF_ESCALATION_BLOCKED,
    // mapped to 403 (ERROR_CODE_HTTP_STATUS) — the real server-side
    // structural prevention (ADR-009), not just a hidden UI button.
    const createResult = await admin.createAccount({ identityId: scopedAdmin.identityId, isSuperAdmin: false });
    expect(createResult.status).toBe(403);
    expect(createResult.body?.error?.code).toBe('SELF_ESCALATION_BLOCKED');
  });

  test('super_admin can deactivate then reactivate another admin account', async ({ request, seededSuperAdmin, seedScopedAdmin }) => {
    const target = await seedScopedAdmin('deactivate-target');
    const admin = adminApiClient(request);

    const loginResult = await admin.login(seededSuperAdmin.login, seededSuperAdmin.password);
    expect(loginResult.status).toBe(200);

    const deactivateResult = await admin.deactivateAccount(target.adminAccountId, 'E2E deactivate scenario — automated runtime gate test');
    expect(deactivateResult.status).toBe(200);
    expect(deactivateResult.body).toEqual({ status: 'deactivated' });

    // Deactivated account can no longer log in at all (AuthService.login
    // checks ProductAccess, but AdminContextMiddleware also filters on
    // AdminAccount.status:'active' — either way the real /auth/login must
    // now reject).
    const deactivatedLoginAttempt = await admin.login(target.login, target.password);
    expect(deactivatedLoginAttempt.status).toBe(200); // login itself succeeds — marketplace-audience-style base identity check
    // But the admin-audience session it created no longer resolves to an
    // active AdminAccount, so /admin/me must reject even with a fresh cookie.
    const meAfterDeactivate = await admin.me();
    expect(meAfterDeactivate.status).toBe(403);

    const reactivateResult = await admin.reactivateAccount(target.adminAccountId, 'E2E reactivate scenario — automated runtime gate test');
    expect(reactivateResult.status).toBe(200);
    expect(reactivateResult.body).toEqual({ status: 'active' });

    const meAfterReactivate = await admin.me();
    expect(meAfterReactivate.status).toBe(200);
  });

  test('grant + revoke: 409 on a stale expectedVersion, 200 on the correct one', async ({ request, seededSuperAdmin, seedScopedAdmin }) => {
    const target = await seedScopedAdmin('grant-revoke-target');
    const admin = adminApiClient(request);

    const loginResult = await admin.login(seededSuperAdmin.login, seededSuperAdmin.password);
    expect(loginResult.status).toBe(200);

    const grantResult = await admin.grantPermission(target.adminAccountId, {
      resource: 'development',
      action: 'read',
      scope: 'city',
      scopeValue: 'batumi-e2e',
    });
    expect(grantResult.status).toBe(200);
    expect(grantResult.body).toEqual({ granted: true });

    const grantsResult = await admin.listGrants(target.adminAccountId);
    expect(grantsResult.status).toBe(200);
    const grant = grantsResult.body.items.find(
      (g: { resource: string; action: string; scopeValue?: string }) => g.resource === 'development' && g.action === 'read' && g.scopeValue === 'batumi-e2e',
    );
    expect(grant).toBeTruthy();

    // Stale version (off by one) -> real 409 VERSION_CONFLICT.
    const staleRevokeResult = await admin.revokeGrant(target.adminAccountId, grant.id, {
      expectedVersion: grant.version + 1,
      reason: 'E2E stale-version revoke attempt — expect 409',
    });
    expect(staleRevokeResult.status).toBe(409);
    expect(staleRevokeResult.body?.error?.code).toBe('VERSION_CONFLICT');

    // Correct version -> real 200, and the grant now shows as revoked.
    const correctRevokeResult = await admin.revokeGrant(target.adminAccountId, grant.id, {
      expectedVersion: grant.version,
      reason: 'E2E correct-version revoke — expect 200',
    });
    expect(correctRevokeResult.status).toBe(200);
    expect(correctRevokeResult.body).toEqual({ revoked: true });

    const grantsAfterRevoke = await admin.listGrants(target.adminAccountId);
    const revokedGrant = grantsAfterRevoke.body.items.find((g: { id: string }) => g.id === grant.id);
    expect(revokedGrant.revokedAt).toBeTruthy();
  });

  test('audit trail records the actions just performed and is queryable via the real audit endpoint', async ({
    request,
    seededSuperAdmin,
    seedScopedAdmin,
  }) => {
    const target = await seedScopedAdmin('audit-target');
    const admin = adminApiClient(request);

    const loginResult = await admin.login(seededSuperAdmin.login, seededSuperAdmin.password);
    expect(loginResult.status).toBe(200);

    const deactivateResult = await admin.deactivateAccount(target.adminAccountId, 'E2E audit-trail scenario — deactivate for audit check');
    expect(deactivateResult.status).toBe(200);

    const auditResult = await admin.auditEvents({ resource: 'admin_account', resourceId: target.adminAccountId });
    expect(auditResult.status).toBe(200);
    expect(Array.isArray(auditResult.body.items)).toBe(true);

    const deactivateEntry = auditResult.body.items.find(
      (event: { action: string; resourceId: string }) => event.action === 'admin_account.deactivate' && event.resourceId === target.adminAccountId,
    );
    expect(deactivateEntry).toBeTruthy();
    expect(deactivateEntry.actor?.id).toBe(seededSuperAdmin.adminAccountId);
    expect(deactivateEntry.reason).toContain('E2E audit-trail scenario');
  });

  test('after admin logout, protected admin routes reject with a real 401/403, not a cached success', async ({
    request,
    seededSuperAdmin,
  }) => {
    const admin = adminApiClient(request);

    const loginResult = await admin.login(seededSuperAdmin.login, seededSuperAdmin.password);
    expect(loginResult.status).toBe(200);

    const meBeforeLogout = await admin.me();
    expect(meBeforeLogout.status).toBe(200);

    const logoutResult = await admin.logout();
    expect(logoutResult.status).toBe(200);
    expect(logoutResult.body).toEqual({ loggedOut: true });

    // No cookie present at all after a real logout -> AdminGuard's
    // AUTH_NO_SESSION branch -> 401 (see admin.guard.ts: differentiates
    // "no cookie at all" (401) from "cookie present but invalid" (403)).
    const meAfterLogout = await admin.me();
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body?.error?.code).toBe('AUTH_NO_SESSION');
  });
});
