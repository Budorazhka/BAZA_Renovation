import { test, expect } from '../fixtures/test';
import type { APIRequestContext } from '@playwright/test';
import { apiUrl } from '../fixtures/env';
import { STRONG_TEST_PASSWORD, uniqueAddress, uniqueLogin, uniquePhone } from '../fixtures/test-data';

/**
 * Reveal-contact on a listing detail page (`<ListingContactForm>`).
 * Asserts the REAL Lead-creation effect through the actual response body
 * (`phone` + `leadId` fields — see CrmService.revealListingContact, which
 * on this branch returns exactly `{ phone, leadId }`, no whatsapp/telegram
 * for listings) and non-disclosure (no organizationId/internal fields ever
 * reach the browser-visible response).
 */
test.describe('listing reveal-contact', () => {
  /**
   * The marketplace publishing wizard creates marketplace-account listings.
   * ListingCrmService intentionally reveals contacts only for organization-
   * owned listings, so this test provisions one through the real organization
   * onboarding + ERP listing API before exercising the public browser flow.
   * No database shortcut is used here.
   */
  async function seedOrganizationListing(request: APIRequestContext) {
    const login = uniqueLogin('reveal-owner');
    const password = STRONG_TEST_PASSWORD;
    const register = await request.post(apiUrl('/auth/register'), { data: { login, password } });
    expect(register.status()).toBe(201);

    const onboarding = await request.post(apiUrl('/organizations/register'), {
      data: { login, password, type: 'agency', name: `E2E Reveal Agency ${login}` },
    });
    expect(onboarding.status()).toBe(201);

    const assetResponse = await request.post(apiUrl('/property-assets'), {
      data: {
        propertyType: 'apartment',
        location: {
          country: 'Georgia',
          city: 'Batumi',
          address: uniqueAddress(),
          geo: { type: 'Point', coordinates: [41.6367, 41.6434] },
        },
        characteristics: { area: 64, rooms: 2, floor: 5, totalFloors: 12 },
        representativePhone: uniquePhone(),
      },
    });
    expect(assetResponse.status()).toBe(201);
    const asset = await assetResponse.json();

    const listingResponse = await request.post(apiUrl(`/property-assets/${asset._id}/listings`), {
      data: { dealType: 'sale', price: { amountMinorUnits: 8_500_000, currency: 'USD' } },
    });
    expect(listingResponse.status()).toBe(201);
    const listing = await listingResponse.json();

    const activateResponse = await request.patch(
      apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/activate`),
    );
    expect(activateResponse.status()).toBe(200);

    const publishResponse = await request.post(
      apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/publish`),
      { headers: { 'Idempotency-Key': `e2e-reveal-${login}` } },
    );
    expect(publishResponse.status()).toBe(202);

    await expect
      .poll(
        async () => {
          const response = await request.get(
            apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/publication-status`),
          );
          if (response.status() !== 200) return null;
          return (await response.json()).status;
        },
        { timeout: 60_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('published');

    const statusResponse = await request.get(
      apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/publication-status`),
    );
    expect(statusResponse.status()).toBe(200);
    const status = await statusResponse.json();
    expect(status.slug).toBeTruthy();
    return status.slug as string;
  }

  test('submitting the contact form reveals a real phone number via the real API', async ({ page, request }) => {
    const slug = await seedOrganizationListing(request);

    await page.goto(`/listings/${slug}`);
    await expect(page.getByRole('heading', { name: 'Связаться с риелтором' })).toBeVisible();

    const revealResponsePromise = page.waitForResponse(
      (res) => res.url().includes(`/public/listings/${slug}/reveal-contact`) && res.request().method() === 'POST',
    );

    await page.getByLabel('Телефон *').fill(uniquePhone());
    await page.getByLabel('Ваше имя').fill('E2E Reveal Test');
    await page.getByRole('button', { name: 'Показать телефон' }).click();

    const response = await revealResponsePromise;
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Real effect: a genuine phone + leadId came back from the server.
    expect(typeof body.phone).toBe('string');
    expect(body.phone.length).toBeGreaterThan(0);
    expect(typeof body.leadId).toBe('string');
    expect(body.leadId).toMatch(/^[a-f0-9]{24}$/);

    // Non-disclosure: CrmService.revealListingContact's public response
    // shape is exactly `{ phone, leadId }` — no organizationId or any other
    // internal field should ever be present in what the browser receives.
    expect(Object.keys(body).sort()).toEqual(['leadId', 'phone']);
    expect(body).not.toHaveProperty('organizationId');
    expect(body).not.toHaveProperty('contactId');
    expect(body).not.toHaveProperty('propertyAssetId');

    // UI reflects the real revealed phone, not a placeholder.
    await expect(page.getByRole('link', { name: body.phone })).toBeVisible();
  });

  test('reveal-contact without a phone number is rejected client-side (no network call)', async ({ page, request }) => {
    const catalogue = await request.get(apiUrl('/public/listings?limit=1'));
    const catalogueBody = await catalogue.json();
    test.skip(catalogueBody.items.length === 0, 'No published listings in this environment.');
    const slug = catalogueBody.items[0].slug;
    test.skip(!slug, 'First listing in the catalogue has no slug.');

    await page.goto(`/listings/${slug}`);
    const submitButton = page.getByRole('button', { name: 'Показать телефон' });
    // Button is disabled while the phone field is empty — HTML `required`
    // input semantics, matches ListingContactForm's `disabled={... || !phone.trim()}`.
    await expect(submitButton).toBeDisabled();
  });

  /**
   * MKT-002-IDEMP: the public reveal endpoint accepts an Idempotency-Key.
   * The two requests below exercise the real HTTP contract against the
   * running API and prove that a retry replays the original sanitized result
   * instead of creating a second Lead.
   */
  test('resubmitting reveal-contact with the same Idempotency-Key returns the same leadId, not a new Lead', async ({
    request,
  }) => {
    const catalogue = await request.get(apiUrl('/public/listings?limit=1'));
    const catalogueBody = await catalogue.json();
    const slug = catalogueBody.items[0]?.slug;
    test.skip(!slug, 'No published listings with a slug in this environment.');

    const idempotencyKey = `reveal-${Date.now()}`;
    const payload = { requesterPhone: uniquePhone(), requesterName: 'Idempotency Test' };

    const first = await request.post(apiUrl(`/public/listings/${slug}/reveal-contact`), {
      headers: { 'Idempotency-Key': idempotencyKey },
      data: payload,
    });
    const second = await request.post(apiUrl(`/public/listings/${slug}/reveal-contact`), {
      headers: { 'Idempotency-Key': idempotencyKey },
      data: payload,
    });

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.leadId).toBe(firstBody.leadId);
  });
});
