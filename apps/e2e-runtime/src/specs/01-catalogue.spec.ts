import { test, expect } from '../fixtures/test';
import { apiUrl } from '../fixtures/env';

/**
 * Marketplace catalogue: open, filter, sort, pagination/cursor behavior,
 * and navigation into a development/listing detail page. All assertions
 * are against the real rendered DOM driven by the real
 * `GET /public/developments` / `GET /public/listings` responses — no
 * mocked/intercepted API responses anywhere in this file.
 *
 * Маршруты обновлены 04.09.2026: каталог переехал с `/` в разделы
 * (`/newconstructions`, `/secondary`, `/rent`) по решению владельца — главная
 * стала информационной, как на действующем baza.sale. Хостом для вкладки
 * объявлений здесь выбран `/newconstructions?tab=listings`, а не `/secondary`:
 * так вкладка задаётся query-параметром и в запрос не подмешивается dealType по
 * умолчанию, то есть проверки параметров API остаются ровно теми же, что были.
 */
test.describe('marketplace catalogue', () => {
  test('opens the developments tab by default and shows a results count', async ({ page }) => {
    const responsePromise = page.waitForResponse((res) => res.url().includes('/public/developments') && res.request().method() === 'GET');
    await page.goto('/newconstructions');
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect(page.locator('.catalogue-count strong')).toBeVisible();
  });

  test('switches to the listings tab via URL query param and reflects it in the tab UI', async ({ page }) => {
    const responsePromise = page.waitForResponse((res) => res.url().includes('/public/listings') && res.request().method() === 'GET');
    await page.goto('/newconstructions?tab=listings');
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    await expect(page.getByRole('tab', { name: 'Вторичка и аренда' })).toHaveAttribute('aria-selected', 'true');
  });

  test('city filter re-queries the API with the city parameter', async ({ page }) => {
    await page.goto('/newconstructions?tab=listings');
    await page.waitForResponse((res) => res.url().includes('/public/listings'));

    const filteredResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/public/listings') && res.url().includes('city=Batumi-e2e'),
    );
    await page.getByRole('searchbox', { name: 'Город' }).first().fill('Batumi-e2e');
    await page.getByRole('button', { name: 'Найти объекты в городе' }).first().click();
    const response = await filteredResponsePromise;
    expect(response.status()).toBe(200);

    // A city with no real data must produce the empty-state panel, not a
    // silently-stale previous result set left on screen.
    await expect(page.locator('.state-panel--empty, .catalogue-end-note')).toBeVisible();
  });

  test('deal-type filter chip re-queries the API with dealType', async ({ page }) => {
    await page.goto('/newconstructions?tab=listings');
    await page.waitForResponse((res) => res.url().includes('/public/listings'));

    const filteredResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/public/listings') && res.url().includes('dealType=rent_long'),
    );
    await page.getByRole('button', { name: 'Снять длительно' }).click();
    const response = await filteredResponsePromise;
    expect(response.status()).toBe(200);
    expect(new URL(page.url()).searchParams.get('dealType')).toBe('rent_long');
  });

  test('sort control re-queries the API with the chosen sort', async ({ page }) => {
    await page.goto('/newconstructions?tab=listings');
    await page.waitForResponse((res) => res.url().includes('/public/listings'));

    const sortedResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/public/listings') && res.url().includes('sort=price_asc'),
    );
    await page.locator('label.sort-control select').selectOption('price_asc');
    const response = await sortedResponsePromise;
    expect(response.status()).toBe(200);
  });

  test('cursor pagination: "Показать ещё" requests the next page with a cursor param when more results exist', async ({
    page,
    request,
  }) => {
    // Only meaningful when the real catalogue actually has more than one
    // page — verified against the real API first (not assumed), so this
    // spec degrades to documenting the end-of-list state instead of
    // asserting on data that may not exist in a freshly-provisioned
    // environment.
    const firstPage = await request.get(apiUrl('/public/developments?limit=1'));
    const firstPageBody = await firstPage.json();

    await page.goto('/newconstructions');
    await page.waitForResponse((res) => res.url().includes('/public/developments'));

    if (!firstPageBody.nextCursor) {
      if (firstPageBody.items?.length === 0) {
        await expect(page.locator('.state-panel--empty')).toBeVisible();
      } else {
        await expect(page.locator('.catalogue-end-note')).toBeVisible();
      }
      return;
    }

    const loadMoreButton = page.getByRole('button', { name: 'Показать ещё' });
    await expect(loadMoreButton).toBeVisible();
    const nextPagePromise = page.waitForResponse((res) => res.url().includes('/public/developments') && res.url().includes('cursor='));
    await loadMoreButton.click();
    const response = await nextPagePromise;
    expect(response.status()).toBe(200);
  });

  test('navigates from the catalogue into a development detail page when one exists', async ({ page, request }) => {
    const listResponse = await request.get(apiUrl('/public/developments?limit=1'));
    const body = await listResponse.json();
    test.skip(body.items.length === 0, 'No published developments in this environment to navigate to.');

    await page.goto('/newconstructions');
    await page.waitForResponse((res) => res.url().includes('/public/developments'));
    await page.locator('.development-card').first().click();
    await expect(page).toHaveURL(/\/developments\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('navigates from the catalogue into a listing detail page when one exists', async ({ page, request }) => {
    const listResponse = await request.get(apiUrl('/public/listings?limit=1'));
    const body = await listResponse.json();
    test.skip(body.items.length === 0, 'No published listings in this environment to navigate to.');

    await page.goto('/newconstructions?tab=listings');
    await page.waitForResponse((res) => res.url().includes('/public/listings'));
    await page.locator('.listing-card').first().click();
    await expect(page).toHaveURL(/\/listings\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
