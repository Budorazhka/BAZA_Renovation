import { test, expect } from '../fixtures/test';
import { env, apiUrl } from '../fixtures/env';
import { uniqueLogin, STRONG_TEST_PASSWORD } from '../fixtures/test-data';

/**
 * Baseline regression smoke check — NOT new feature coverage. Confirms
 * plain public catalogue/listing/development browsing and the existing
 * auth register/login flow are not broken by anything added for D-07
 * (the new admin-web service, the CORS_ALLOWED_ORIGIN_ADMIN wiring, the
 * preflight gate itself). Kept deliberately small.
 */
test.describe('baseline smoke', () => {
  test('marketplace catalogue root renders and API is reachable', async ({ page, request }) => {
    const health = await request.get(`${env.apiUrl}/health`);
    expect(health.status()).toBe(200);

    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
    // The wordmark is rendered in both the sticky header and the footer;
    // scope this assertion to the header so the locator remains strict after
    // the footer is mounted on the catalogue root.
    await expect(page.getByRole('banner').getByRole('link', { name: 'BAZA, каталог объектов недвижимости' })).toBeVisible();
  });

  test('public catalogue API responds with a valid page shape', async ({ request }) => {
    const response = await request.get(apiUrl('/public/developments'));
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body).toHaveProperty('nextCursor');
  });

  test('register + login flow works end to end against the real API', async ({ request }) => {
    const login = uniqueLogin('smoke');

    const registerResponse = await request.post(apiUrl('/auth/register'), {
      headers: { Origin: env.marketplaceOrigin },
      data: { login, password: STRONG_TEST_PASSWORD },
    });
    expect(registerResponse.status()).toBe(201);
    const registerBody = await registerResponse.json();
    expect(registerBody).toHaveProperty('identityId');

    const loginResponse = await request.post(apiUrl('/auth/login'), {
      headers: { Origin: env.marketplaceOrigin },
      data: { login, password: STRONG_TEST_PASSWORD },
    });
    expect(loginResponse.status()).toBe(200);
    const loginBody = await loginResponse.json();
    expect(loginBody.identityId).toBe(registerBody.identityId);
    expect(loginBody.requires2fa).toBe(false);

    const setCookie = loginResponse.headers()['set-cookie'];
    expect(setCookie).toContain('baza_session=');
  });
});
