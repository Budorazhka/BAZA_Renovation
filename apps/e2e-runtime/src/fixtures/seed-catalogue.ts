import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import { apiUrl } from './env';
import { STRONG_TEST_PASSWORD, uniqueAddress, uniqueLogin, uniquePhone } from './test-data';

/**
 * Засев публичного каталога реальными данными.
 *
 * Зачем это появилось 05.09.2026. Runtime-стек поднимается с чистой базой, и
 * проверки каталога до сих пор выполнялись на пустой выдаче: сценарий требовал
 * счётчик, счётчика на пустом каталоге нет, тест падал. Первым побуждением было
 * ослабить проверку и принять пустое состояние — но так гейт подтверждал бы, что
 * страница умеет показывать «пусто», а не что каталог работает.
 *
 * Правильный ход — дать окружению данные. Здесь один рецепт на весь набор
 * сценариев, вместо копии в каждом файле: рецепт длинный (регистрация,
 * онбординг организации, создание, активация, публикация, ожидание сборки
 * проекции), и разъехавшиеся копии — вопрос времени.
 *
 * **Каждый засев работает в собственном HTTP-контексте.** Сессия живёт в
 * cookie, и два онбординга на одном контексте затёрли бы сессию друг друга:
 * запросы второй организации ушли бы от имени первой. При параллельном запуске
 * это выглядело бы как случайные отказы прав.
 */

/** Выполняет засев в отдельном контексте с собственной cookie-сессией. */
async function inOwnContext<T>(work: (request: APIRequestContext) => Promise<T>): Promise<T> {
  const context = await apiRequest.newContext();
  try {
    return await work(context);
  } finally {
    await context.dispose();
  }
}

async function registerOrganization(
  request: APIRequestContext,
  type: 'agency' | 'developer',
  prefix: string,
): Promise<{ login: string }> {
  const login = uniqueLogin(prefix);
  const register = await request.post(apiUrl('/auth/register'), {
    data: { login, password: STRONG_TEST_PASSWORD },
  });
  expect(register.status()).toBe(201);

  const onboarding = await request.post(apiUrl('/organizations/register'), {
    data: { login, password: STRONG_TEST_PASSWORD, type, name: `E2E ${prefix} ${login}` },
  });
  expect(onboarding.status()).toBe(201);

  return { login };
}

/**
 * Опубликованное объявление вторички. Возвращает slug публикации.
 *
 * Ожидание статуса `published` обязательно: публикация собирается воркером
 * асинхронно, и без ожидания сценарий пошёл бы искать в каталоге объект,
 * которого там ещё нет.
 */
export async function seedPublishedListing(): Promise<string> {
  return inOwnContext(async (request) => {
  const { login } = await registerOrganization(request, 'agency', 'catalogue-agency');

  const assetResponse = await request.post(apiUrl('/property-assets'), {
    headers: { 'Idempotency-Key': randomUUID() },
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
    headers: { 'Idempotency-Key': randomUUID() },
    data: { dealType: 'sale', price: { amountMinorUnits: 8_500_000, currency: 'USD' } },
  });
  expect(listingResponse.status()).toBe(201);
  const listing = await listingResponse.json();

  expect(
    (await request.patch(apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/activate`))).status(),
  ).toBe(200);

  expect(
    (
      await request.post(apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/publish`), {
        headers: { 'Idempotency-Key': `e2e-catalogue-${login}` },
      })
    ).status(),
  ).toBe(202);

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

  const status = await (
    await request.get(apiUrl(`/property-assets/${asset._id}/listings/${listing._id}/publication-status`))
  ).json();
  return status.slug as string;
  });
}

/**
 * Опубликованный ЖК. Возвращает slug публикации.
 *
 * Организация здесь именно `developer`: ЖК создаёт и публикует только
 * застройщик (`DevelopmentsService.requireDeveloperOrganization`), агентству
 * тот же запрос вернёт отказ.
 */
export async function seedPublishedDevelopment(): Promise<string> {
  return inOwnContext(async (request) => {
  const { login } = await registerOrganization(request, 'developer', 'catalogue-developer');

  const developmentResponse = await request.post(apiUrl('/developments'), {
    headers: { 'Idempotency-Key': randomUUID() },
    data: {
      name: `E2E ЖК ${login}`,
      location: {
        country: 'Georgia',
        city: 'Batumi',
        address: uniqueAddress(),
        geo: { type: 'Point', coordinates: [41.6412, 41.6501] },
      },
      contact: { phone: uniquePhone() },
      classType: 'comfort',
      completionDate: '2027-Q4',
      description: 'Объект, засеянный сквозным гейтом для проверки каталога.',
    },
  });
  expect(developmentResponse.status()).toBe(201);
  const development = await developmentResponse.json();

  expect(
    (
      await request.post(apiUrl(`/developments/${development._id}/publish`), {
        headers: { 'Idempotency-Key': `e2e-catalogue-dev-${login}` },
      })
    ).status(),
  ).toBe(202);

  await expect
    .poll(
      async () => {
        const response = await request.get(apiUrl(`/developments/${development._id}/publication-status`));
        if (response.status() !== 200) return null;
        return (await response.json()).status;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe('published');

  const status = await (
    await request.get(apiUrl(`/developments/${development._id}/publication-status`))
  ).json();
  return status.slug as string;
  });
}
