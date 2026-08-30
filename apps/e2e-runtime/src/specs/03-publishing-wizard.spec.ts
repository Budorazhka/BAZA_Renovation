import { test, expect } from '../fixtures/test';
import { apiUrl } from '../fixtures/env';
import { uniqueLogin, uniqueAddress, uniquePhone, STRONG_TEST_PASSWORD } from '../fixtures/test-data';
import { fileURLToPath } from 'node:url';

const TEST_PHOTO_PATH = fileURLToPath(new URL('../fixtures/assets/tiny-listing-photo.jpg', import.meta.url));

/**
 * Full publishing wizard end-to-end: register/login -> create property
 * asset -> create+activate listing -> upload+confirm a real media file
 * (tiny-listing-photo.jpg, a genuine valid JPEG — magic bytes verified,
 * see fixtures/assets docblock and MediaMimeVerifierService which sniffs
 * real magic bytes, not the declared Content-Type) -> publish with a real
 * Idempotency-Key header (this DOES exist for publishListing on this
 * branch, ADR-006 style, unlike reveal-contact — see
 * MarketplacePropertyAssetsController.publishListing) -> poll
 * publication-status until the worker's outbox processing marks it
 * published -> verify the listing now appears in the public catalogue and
 * its own detail page.
 *
 * Each identity/login used is unique-per-run (fixtures/test-data.ts) — no
 * explicit teardown needed: property assets/listings/publications have no
 * DELETE endpoint by design (append-only/soft-lifecycle), so a unique
 * identity per test run means nothing here can ever collide with a
 * previous run's leftover data.
 */
test.describe('publishing wizard', () => {
  test.describe.configure({ timeout: 90_000 });

  test('publishes a listing end to end and it becomes visible in the public catalogue', async ({ page }) => {
    const login = uniqueLogin('publisher');

    await page.goto('/publish');
    await expect(page.getByTestId('wizard-step-auth')).toBeVisible();

    // --- Auth step: register + login (embedded in the wizard, no separate /login route) ---
    await page.getByTestId('auth-tab-register').click();
    await page.getByTestId('auth-input-login').fill(login);
    await page.getByTestId('auth-input-password').fill(STRONG_TEST_PASSWORD);
    await page.getByTestId('auth-input-confirm-password').fill(STRONG_TEST_PASSWORD);

    const registerResponsePromise = page.waitForResponse((res) => res.url().includes('/auth/register') && res.request().method() === 'POST');
    const loginResponsePromise = page.waitForResponse((res) => res.url().includes('/auth/login') && res.request().method() === 'POST');
    await page.getByTestId('auth-submit-btn').click();

    const registerResponse = await registerResponsePromise;
    expect(registerResponse.status()).toBe(201);
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);

    // --- Step 1: Location ---
    await expect(page.getByTestId('wizard-step-location')).toBeVisible();
    await page.getByTestId('location-input-address').fill(uniqueAddress());
    await page.getByTestId('location-next-btn').click();

    // --- Step 2: Characteristics -> creates the real PropertyAsset ---
    await expect(page.getByTestId('wizard-step-characteristics')).toBeVisible();
    await page.getByTestId('property-type-apartment').click();
    await page.getByTestId('characteristics-input-area').fill('64');
    await page.getByTestId('characteristics-input-rooms').fill('2');
    await page.getByTestId('characteristics-input-floor').fill('5');
    await page.getByTestId('characteristics-input-total-floors').fill('12');
    await page.getByTestId('characteristics-input-phone').fill(uniquePhone());

    const createAssetPromise = page.waitForResponse(
      (res) => res.url().endsWith('/marketplace/property-assets') && res.request().method() === 'POST',
    );
    await page.getByTestId('characteristics-next-btn').click();
    const createAssetResponse = await createAssetPromise;
    expect(createAssetResponse.status()).toBe(201);

    // --- Step 3: Deal & Pricing -> creates + activates the real Listing ---
    await expect(page.getByTestId('wizard-step-deal')).toBeVisible();
    await page.getByTestId('deal-type-sale').click();
    await page.getByTestId('deal-input-price').fill('85000');

    const createListingPromise = page.waitForResponse(
      (res) => /\/marketplace\/property-assets\/[^/]+\/listings$/.test(res.url()) && res.request().method() === 'POST',
    );
    const activateListingPromise = page.waitForResponse(
      (res) => /\/listings\/[^/]+\/activate$/.test(res.url()) && res.request().method() === 'PATCH',
    );
    await page.getByTestId('deal-next-btn').click();
    const createListingResponse = await createListingPromise;
    expect(createListingResponse.status()).toBe(201);
    const activateListingResponse = await activateListingPromise;
    expect(activateListingResponse.status()).toBe(200);

    // --- Step 4: Media -> real 3-phase upload (intent -> presigned PUT -> confirm) ---
    await expect(page.getByTestId('wizard-step-media')).toBeVisible();

    const uploadIntentPromise = page.waitForResponse(
      (res) => res.url().includes('/media/upload-intent') && res.request().method() === 'POST',
    );
    const confirmMediaPromise = page.waitForResponse(
      (res) => res.url().includes('/confirm') && res.request().method() === 'POST',
    );
    await page.getByTestId('media-file-input').setInputFiles(TEST_PHOTO_PATH);

    const uploadIntentResponse = await uploadIntentPromise;
    expect(uploadIntentResponse.status()).toBe(201);
    const confirmMediaResponse = await confirmMediaPromise;
    expect(confirmMediaResponse.status()).toBe(200);

    await expect(page.getByTestId('media-cover-badge')).toBeVisible();

    await page.getByTestId('media-next-btn').click();

    // --- Step 5: Review & Publish (with a real Idempotency-Key header) ---
    await expect(page.getByTestId('wizard-step-review')).toBeVisible();

    const publishResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/publish') && res.request().method() === 'POST',
    );
    await page.getByTestId('publish-submit-btn').click();
    const publishResponse = await publishResponsePromise;
    expect(publishResponse.status()).toBe(202);
    expect(publishResponse.request().headers()['idempotency-key']).toBeTruthy();

    // --- Poll publication-status until the worker's outbox handler publishes it ---
    await expect(page.getByTestId('wizard-step-publishing').or(page.getByTestId('wizard-step-published'))).toBeVisible();

    await expect(page.getByTestId('wizard-step-published')).toBeVisible({ timeout: 60_000 });
    const viewListingLink = page.getByTestId('view-published-listing-btn');
    await expect(viewListingLink).toBeVisible();
    const href = await viewListingLink.getAttribute('href');
    expect(href).toMatch(/^\/listings\//);
    const slug = href!.replace('/listings/', '');

    // --- Verify the published listing is now real, publicly visible data (not just wizard-local state) ---
    const publicListingResponse = await page.request.get(apiUrl(`/public/listings/${slug}`));
    expect(publicListingResponse.status()).toBe(200);
    const publicListingBody = await publicListingResponse.json();
    expect(publicListingBody.slug).toBe(slug);
    expect(publicListingBody.price?.amountMinorUnits).toBe(8500000);

    await page.goto(`/listings/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
