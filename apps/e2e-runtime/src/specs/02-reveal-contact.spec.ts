import { test, expect } from '../fixtures/test';
import { apiUrl } from '../fixtures/env';
import { uniquePhone } from '../fixtures/test-data';

/**
 * Reveal-contact on a listing detail page (`<ListingContactForm>`).
 * Asserts the REAL Lead-creation effect through the actual response body
 * (`phone` + `leadId` fields — see CrmService.revealListingContact, which
 * on this branch returns exactly `{ phone, leadId }`, no whatsapp/telegram
 * for listings) and non-disclosure (no organizationId/internal fields ever
 * reach the browser-visible response).
 */
test.describe('listing reveal-contact', () => {
  test('submitting the contact form reveals a real phone number via the real API', async ({ page, request }) => {
    const catalogue = await request.get(apiUrl('/public/listings?limit=1'));
    const catalogueBody = await catalogue.json();
    test.skip(catalogueBody.items.length === 0, 'No published listings in this environment to reveal contact on.');

    const slug = catalogueBody.items[0].slug;
    test.skip(!slug, 'First listing in the catalogue has no slug.');

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
   * MKT-002-IDEMP: reveal-contact does NOT send an Idempotency-Key header on
   * this branch (codex/marketplace-integration-gate @ 6e81007) — confirmed
   * by reading both ListingCrmController (apps/api/src/modules/crm/listing-crm.controller.ts,
   * no @Headers('idempotency-key') anywhere) and ListingContactForm/
   * marketplaceApi.revealListingContact (apps/marketplace-web, no
   * Idempotency-Key header set on the request). Idempotency-Key support for
   * reveal-contact lives on codex/marketplace-operational-hardening —
   * written here as a real test structured exactly like it will need to
   * work once that lands (same double-submit-same-key shape as the
   * publish-listing Idempotency-Key test in 03-publishing-wizard.spec.ts),
   * but explicitly skipped per owner decision: do not omit the scenario,
   * do not fake a pass.
   */
  test('resubmitting reveal-contact with the same Idempotency-Key returns the same leadId, not a new Lead', async ({
    request,
  }) => {
    test.skip(
      true,
      'reveal-contact Idempotency-Key not implemented on this branch (codex/marketplace-integration-gate @ 6e81007) — see codex/marketplace-operational-hardening branch; activate once merged.',
    );

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
