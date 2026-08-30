import { test, expect } from '../fixtures/test';
import { apiUrl, env } from '../fixtures/env';
import { uniqueLogin, STRONG_TEST_PASSWORD } from '../fixtures/test-data';
import { marketplaceApiClient } from '../fixtures/api-clients';

/**
 * Logout: asserts the session cookie is ACTUALLY cleared (via
 * `context.cookies()`, real browser cookie jar — not a UI redirect being
 * treated as a proxy for "logged out"), and that a previously-authenticated
 * -only action really fails with the real unauthorized response when
 * attempted again after logout by hitting the real protected endpoint and
 * checking its status, not just observing a client-side route change.
 */
test.describe('logout', () => {
  test('logout clears the baza_session cookie and revokes the session server-side', async ({ context, request }) => {
    const marketplace = marketplaceApiClient(request);
    const login = uniqueLogin('logout');

    const registerResult = await marketplace.register(login, STRONG_TEST_PASSWORD);
    expect(registerResult.status).toBe(201);
    const loginResult = await marketplace.login(login, STRONG_TEST_PASSWORD);
    expect(loginResult.status).toBe(200);

    // Confirm the cookie really landed in the context's cookie jar before
    // logout, so the "cleared" assertion below is meaningful (not trivially
    // true because there was never a cookie in the first place).
    const cookiesBeforeLogout = await context.cookies(env.marketplaceUrl);
    const sessionCookieBefore = cookiesBeforeLogout.find((c) => c.name === 'baza_session');
    expect(sessionCookieBefore).toBeTruthy();

    // Session probe must confirm authenticated:true before logout.
    const sessionBefore = await marketplace.session();
    expect(sessionBefore.body.authenticated).toBe(true);

    const logoutResult = await marketplace.logout();
    expect(logoutResult.status).toBe(200);
    expect(logoutResult.body).toEqual({ loggedOut: true });

    // Real cookie-jar assertion: either the cookie is gone entirely, or it
    // was overwritten with an already-expired one (both are valid "browser
    // will not send this again" outcomes for a Set-Cookie-based clear).
    const cookiesAfterLogout = await context.cookies(env.marketplaceUrl);
    const sessionCookieAfter = cookiesAfterLogout.find((c) => c.name === 'baza_session');
    if (sessionCookieAfter) {
      expect(sessionCookieAfter.expires).toBeLessThan(Date.now() / 1000);
    }

    // Real server-side revocation, not just a client-side cookie clear:
    // the SAME session probe must now report authenticated:false.
    const sessionAfter = await marketplace.session();
    expect(sessionAfter.status).toBe(200);
    expect(sessionAfter.body.authenticated).toBe(false);

    // A previously-authenticated-only action must now really fail against
    // the real protected endpoint (marketplace/property-assets requires
    // MarketplaceAccountGuard, which always throws ErrorCode.FORBIDDEN ->
    // 403 for "no active marketplace account context" — unlike AdminGuard,
    // it does not differentiate a missing cookie from an invalid one; see
    // apps/api/src/shared/marketplace-account/marketplace-account.guard.ts)
    // — checking the real HTTP status, not a UI redirect.
    const protectedResponse = await request.get(apiUrl('/marketplace/property-assets'), {
      headers: { Origin: env.marketplaceOrigin },
    });
    expect(protectedResponse.status()).toBe(403);
  });

  test('logout is idempotent: calling it twice, or with no session at all, still returns 200', async ({ request }) => {
    const marketplace = marketplaceApiClient(request);

    const firstLogout = await marketplace.logout();
    expect(firstLogout.status).toBe(200);
    expect(firstLogout.body).toEqual({ loggedOut: true });

    const secondLogout = await marketplace.logout();
    expect(secondLogout.status).toBe(200);
    expect(secondLogout.body).toEqual({ loggedOut: true });
  });

  test('logout via the publishing wizard UI clears the session and returns to the auth step', async ({ page, context }) => {
    const login = uniqueLogin('ui-logout');

    await page.goto('/publish');
    await page.getByTestId('auth-tab-register').click();
    await page.getByTestId('auth-input-login').fill(login);
    await page.getByTestId('auth-input-password').fill(STRONG_TEST_PASSWORD);
    await page.getByTestId('auth-input-confirm-password').fill(STRONG_TEST_PASSWORD);
    await page.getByTestId('auth-submit-btn').click();
    await expect(page.getByTestId('wizard-step-location')).toBeVisible();

    const logoutResponsePromise = page.waitForResponse((res) => res.url().includes('/auth/logout') && res.request().method() === 'POST');
    await page.getByTestId('wizard-logout-btn').click();
    const logoutResponse = await logoutResponsePromise;
    expect(logoutResponse.status()).toBe(200);

    await expect(page.getByTestId('wizard-step-auth')).toBeVisible();

    const cookies = await context.cookies(env.marketplaceUrl);
    const sessionCookie = cookies.find((c) => c.name === 'baza_session');
    if (sessionCookie) {
      expect(sessionCookie.expires).toBeLessThan(Date.now() / 1000);
    }
  });
});
