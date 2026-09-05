/**
 * Снимает скриншоты экранов marketplace в габаритах Figma-фреймов.
 *
 * Существует ради пункта DoD гейта «Screenshot implementation сопоставлен с
 * Figma» (docs/discovery/figma-ui-delivery-gate.md): до 04.09.2026 по 21 экрану
 * не было снято ни одного скриншота, поэтому ни один экран нельзя было сдать.
 *
 * Скриншот — половина сверки. Вторая половина, сопоставление с фреймом, делается
 * человеком; этот скрипт только даёт материал и делает его воспроизводимым.
 *
 * Основной способ запуска — сквозной гейт: шаг «Capture marketplace
 * screenshots» в .github/workflows/runtime-release-gate.yml снимает экраны на
 * поднятом стеке с реальными данными и кладёт их артефактом
 * `marketplace-screenshots`. Локально стек поднять получается не у всех (нужен
 * Docker), а снимки без backend показывают состояние ошибки загрузки, по
 * которому вёрстку не сверить.
 *
 * Локально, если стек всё-таки есть:
 *   pnpm runtime:up
 *   node apps/e2e-runtime/scripts/capture-marketplace-screens.mjs
 *
 * Без стека, только вёрстка пустых состояний:
 *   pnpm --filter @baza/marketplace-web build
 *   npx vite preview --port 4173   # из apps/marketplace-web
 *   node scripts/capture-marketplace-screens.mjs
 *
 * Переменные: BASE_URL (по умолчанию http://localhost:4173),
 * OUT_DIR (по умолчанию ../../docs/discovery/screenshots).
 */
import { randomUUID } from 'node:crypto';
import { chromium, request as apiRequest } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';
const API_URL = process.env.RUNTIME_API_URL ?? 'http://localhost:3000';
const API_BASE_PATH = process.env.RUNTIME_API_BASE_PATH ?? '/api/v1';
const OUT_DIR = process.env.OUT_DIR ?? resolve(HERE, '../../../docs/discovery/screenshots');

/**
 * Полный адрес эндпоинта, как в фикстурах гейта (`fixtures/env.ts`).
 *
 * Не `baseURL` у контекста: Playwright резолвит относительные пути через
 * `new URL()`, а `new URL('/auth/register', 'http://api/api/v1')` отбрасывает
 * префикс версии и даёт `http://api/auth/register`. Именно так первый прогон
 * съёмки получил 404 на регистрацию и снял весь кабинет формой входа.
 */
function apiUrl(path) {
  return `${API_URL}${API_BASE_PATH}${path}`;
}

/**
 * Экраны в терминах гейта. `figmaFrame` — фрейм, с которым потом сверяют, чтобы
 * человек не искал ID заново. `data` говорит, откуда экран берёт содержимое:
 * это меняет смысл скриншота (см. README рядом со снимками).
 *
 * Часть путей известна только в рантайме: детальные страницы адресуются slug'ом
 * опубликованного объекта, а страница редактирования — идентификаторами объекта
 * самой сессии. Поэтому список собирается функцией, а не лежит константой.
 */
function buildScreens({ developmentSlug, listingSlug, ownerListing }) {
  const screens = [
    { id: 'MKT-SCR-001', name: 'Главная (информационная)', path: '/', figmaFrame: '3428:55239 / 1035:18101', data: 'static' },
    { id: 'MKT-SCR-004', name: 'Каталог новостроек (список)', path: '/newconstructions', figmaFrame: '236:27197 / 4182:72529', data: 'api' },
    { id: 'MKT-SCR-005', name: 'Каталог новостроек (карта)', path: '/newconstructions?view=map', figmaFrame: '236:26596 / 3854:67902', data: 'api' },
    { id: 'MKT-SCR-010', name: 'Каталог вторички', path: '/secondary', figmaFrame: '236:27197 / 3854:62977', data: 'api' },
    { id: 'MKT-SCR-011', name: 'Каталог аренды', path: '/rent', figmaFrame: '236:27197 / 4182:69880', data: 'api' },
    { id: 'MKT-SCR-013', name: 'Вход', path: '/auth/login', figmaFrame: 'Figma gap — фрейма нет', data: 'static' },
    { id: 'MKT-SCR-014', name: 'Рейтинг риэлторов', path: '/realtors', figmaFrame: '3576:53108 / 3699:60246', data: 'fixture' },
    { id: 'MKT-SCR-015', name: 'Профиль риэлтора', path: '/realtors/1', figmaFrame: '3576:53737 / 3699:60823', data: 'fixture' },
    { id: 'MKT-SCR-016', name: 'Запросы клиентов', path: '/requests', figmaFrame: '2287:34150', data: 'fixture' },
    { id: 'MKT-SCR-017', name: 'Избранное', path: '/favorites', figmaFrame: '1376:19390 / 1376:19776', data: 'api' },
    { id: 'MKT-SCR-018', name: 'Подборки объектов', path: '/selections', figmaFrame: '1311:18621 / 1311:18671', data: 'fixture' },
    { id: 'MKT-SCR-019', name: 'Кабинет: мои объекты', path: '/account/properties', figmaFrame: '5071:68119 / 5071:68253', data: 'api' },
    { id: 'MKT-SCR-020', name: 'Мастер публикации', path: '/publish', figmaFrame: 'не назначен', data: 'api' },
    { id: 'MKT-SCR-027', name: 'Страница «не найдено»', path: '/no-such-page-for-capture', figmaFrame: 'Figma gap — фрейма нет', data: 'static' },
  ];

  // Детальные страницы: без опубликованного объекта снимать нечего, и снимок
  // «объект не найден» вместо карточки ЖК только запутал бы сверку.
  if (developmentSlug) {
    screens.push({ id: 'MKT-SCR-007', name: 'Карточка ЖК (детальная)', path: `/developments/${developmentSlug}`, figmaFrame: '3314:200742 / 3314:201711', data: 'api' });
  }
  if (listingSlug) {
    screens.push({ id: 'MKT-SCR-012', name: 'Детальная страница вторички', path: `/listings/${listingSlug}`, figmaFrame: '3314:206822 / 4182:60867', data: 'api' });
  }
  if (ownerListing) {
    screens.push({
      id: 'MKT-SCR-021',
      name: 'Редактирование объявления',
      path: `/account/properties/${ownerListing.assetId}/listings/${ownerListing.listingId}/edit`,
      figmaFrame: '3304:56602 / 3304:56098',
      data: 'api',
    });
  }

  return screens;
}

/** Ровно два брейкпоинта Figma: промежуточного tablet в файле нет. */
const VIEWPORTS = [
  { key: 'desktop', width: 1920, height: 1080 },
  { key: 'mobile', width: 375, height: 812 },
];

/**
 * Заводит объект и объявление от лица уже вошедшей сессии.
 *
 * Без этого кабинет («мои объекты») снимается пустым состоянием, а страницу
 * редактирования снять нельзя вовсе: её адрес состоит из идентификаторов
 * объекта, которого у свежего аккаунта нет. Пустой кабинет — тоже состояние и
 * его надо сверять, но не вместо основного.
 *
 * Регистрация здесь не нужна: объект заводится существующей сессией, лимит
 * `/auth/register` не тратится.
 */
async function seedOwnerListing(api) {
  try {
    const asset = await api.post(apiUrl('/marketplace/property-assets'), {
      headers: { 'Idempotency-Key': randomUUID() },
      data: {
        propertyType: 'apartment',
        location: {
          country: 'GE',
          city: 'Batumi',
          address: `Capture address ${Date.now()}`,
          geo: { type: 'Point', coordinates: [41.6367, 41.6434] },
        },
        characteristics: { area: 58, rooms: 2, floor: 7, totalFloors: 14 },
        representativePhone: '+995555000111',
      },
    });
    if (asset.status() !== 201) return null;
    const assetId = (await asset.json())._id;

    const listing = await api.post(apiUrl(`/marketplace/property-assets/${assetId}/listings`), {
      headers: { 'Idempotency-Key': randomUUID() },
      data: { dealType: 'sale', price: { amountMinorUnits: 9_200_000, currency: 'USD' } },
    });
    if (listing.status() !== 201) return null;

    return { assetId, listingId: (await listing.json())._id };
  } catch {
    // Съёмка не должна падать из-за засева: без объекта просто снимутся пустые
    // состояния, и это видно по отчёту.
    return null;
  }
}

/**
 * Slug'и опубликованных объектов из публичного каталога.
 *
 * Детальные страницы адресуются только slug'ом, а какой именно объект окажется
 * в каталоге, зависит от того, что засеяли сквозные сценарии до съёмки.
 */
async function resolvePublicSlugs() {
  const api = await apiRequest.newContext();
  try {
    const read = async (path) => {
      const response = await api.get(apiUrl(path));
      if (response.status() !== 200) return null;
      const body = await response.json();
      return body.items?.[0]?.slug ?? null;
    };
    return {
      developmentSlug: await read('/public/developments?limit=1'),
      listingSlug: await read('/public/listings?limit=1'),
    };
  } catch {
    return { developmentSlug: null, listingSlug: null };
  } finally {
    await api.dispose();
  }
}

/**
 * Заводит аккаунт для съёмки и объект у него.
 *
 * Не отдаёт `storageState`: перенос cookie из HTTP-контекста в браузер
 * оказался нерабочим. Прогон 05.09.2026 показал это прямо — регистрация и
 * вход по API прошли (`signedIn: true`), объект завёлся, адрес страницы
 * редактирования собрался с настоящими идентификаторами, а кабинет всё равно
 * снялся формой входа: перенесённая cookie до запросов из страницы не дошла.
 * Поэтому браузер входит сам, через форму, и получает cookie на общих
 * основаниях (см. `signInThroughUi`).
 *
 * До этого была ещё одна причина того же снимка, уже исправленная: контекст
 * создавался с `baseURL`, оканчивающимся на `/api/v1`, а Playwright резолвит
 * относительные пути через `new URL()` — префикс версии отбрасывался, и
 * регистрация уходила мимо API. Отсюда `apiUrl`.
 *
 * Ожидание на 429 оставлено: лимит в пять регистраций в минуту на IP общий,
 * съёмка идёт следом за сквозными сценариями с того же адреса.
 */
async function createCaptureAccount() {
  const login = `capture-${Date.now()}@example.com`;
  const password = 'Correct-Horse-Battery-Staple-1!';
  const api = await apiRequest.newContext();
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const registered = await api.post(apiUrl('/auth/register'), { data: { login, password } });
      if (registered.status() === 429) {
        // Окно лимита — 60 секунд; ждём заметную его часть, а не сотни миллисекунд.
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        continue;
      }
      if (registered.status() !== 201) {
        return { login: null, password: null, ownerListing: null, reason: `register ${registered.status()}: ${(await registered.text()).slice(0, 200)}` };
      }
      const loggedIn = await api.post(apiUrl('/auth/login'), {
        data: { login, password },
        headers: { Origin: BASE_URL },
      });
      if (loggedIn.status() !== 200 && loggedIn.status() !== 201) {
        return { login: null, password: null, ownerListing: null, reason: `login ${loggedIn.status()}: ${(await loggedIn.text()).slice(0, 200)}` };
      }
      const ownerListing = await seedOwnerListing(api);
      return { login, password, ownerListing, reason: ownerListing ? null : 'объект сессии не завёлся' };
    }
    return { login: null, password: null, ownerListing: null, reason: 'register 429: лимит не отпустил за четыре попытки' };
  } catch (err) {
    return { login: null, password: null, ownerListing: null, reason: String(err).split('\n')[0] };
  } finally {
    await api.dispose();
  }
}

/**
 * Вход через форму, в том же браузерном контексте, в котором потом снимаем.
 *
 * Cookie ставит сам браузер, поэтому все её атрибуты (домен, путь, SameSite)
 * заведомо те, с которыми она работает в жизни. Разделы кабинета закрыты
 * `RequireAuth`, и без этого шага половина списка снимается формой входа.
 */
async function signInThroughUi(context, credentials) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByTestId('auth-input-login').fill(credentials.login);
    await page.getByTestId('auth-input-password').fill(credentials.password);

    // `/auth/login` ограничен десятью запросами в минуту на IP. Съёмка тратит
    // два входа (API-контекст и браузер) поверх тех, что сделал набор
    // сценариев, и приходит к остатку бюджета — на 429 ждём и жмём снова.
    let loginResponse = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loginResponsePromise = page.waitForResponse(
        (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
        { timeout: 30_000 },
      );
      await page.getByTestId('auth-submit-btn').click();
      loginResponse = await loginResponsePromise;
      if (loginResponse.status() !== 429) break;
      await page.waitForTimeout(20_000);
    }
    if (loginResponse.status() !== 200 && loginResponse.status() !== 201) {
      return `POST /auth/login -> ${loginResponse.status()}: ${(await loginResponse.text()).slice(0, 200)}`;
    }

    // Форма исчезает только когда сессия принята. Если не исчезла, причина
    // почти всегда видна на самой странице или в проверке сессии, поэтому
    // ждём и то, и другое, а не один таймаут без объяснения.
    const sessionResponsePromise = page
      .waitForResponse((res) => res.url().includes('/auth/session'), { timeout: 20_000 })
      .catch(() => null);
    try {
      await page.getByTestId('auth-page').waitFor({ state: 'detached', timeout: 20_000 });
      return null;
    } catch {
      const shownError = await page
        .getByTestId('auth-error')
        .textContent({ timeout: 1_000 })
        .catch(() => null);
      const sessionResponse = await sessionResponsePromise;
      const sessionPart = sessionResponse
        ? `GET /auth/session -> ${sessionResponse.status()}`
        : 'GET /auth/session не наблюдался';
      return `форма входа не исчезла; ${sessionPart}; на экране: ${shownError?.trim() || 'ошибки нет'}`;
    }
  } catch (err) {
    return String(err).split('\n')[0];
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const { developmentSlug, listingSlug } = await resolvePublicSlugs();
  if (!developmentSlug) console.warn('[capture] В каталоге нет опубликованного ЖК — MKT-SCR-007 не снимается.');
  if (!listingSlug) console.warn('[capture] В каталоге нет опубликованного объявления — MKT-SCR-012 не снимается.');

  const browser = await chromium.launch();
  const report = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });

    /*
     * Свой аккаунт на каждый брейкпоинт.
     *
     * Так пришлось прийти через два неудачных подхода. Перенос сессии из
     * HTTP-клиента в браузер не работает (прогон 5d4943a), перенос из одного
     * браузерного контекста в другой — тоже (прогон 66ea5f9, кабинет снялся
     * формой входа в обоих). Вход по разу на контекст работал только для
     * первого: на 2886aeb десктоп вошёл, а мобильный на тех же данных остался
     * на форме, хотя POST /auth/login ответил успехом.
     *
     * Единственное, чем второй контекст отличался от первого, — повторный вход
     * тем же аккаунтом. Эту переменную и убираем: у каждого контекста свой
     * аккаунт и свой объект. Заодно адрес страницы редактирования становится
     * своим для каждого брейкпоинта, а не общим.
     *
     * Почему повторный вход не давал сессии, я не выяснил. Это остаётся
     * открытым вопросом, но не к съёмке.
     */
    const account = await createCaptureAccount();
    let signInError = account.login ? null : account.reason;
    if (!account.login) {
      console.warn(`[capture] ${viewport.key}: аккаунт не завёлся (${account.reason}) — кабинет снимется формой входа.`);
    } else {
      if (!account.ownerListing) {
        console.warn(`[capture] ${viewport.key}: объект сессии не завёлся — кабинет снимется пустым.`);
      }
      const uiError = await signInThroughUi(context, account);
      if (uiError) {
        signInError = `вход через форму: ${uiError}`;
        console.warn(`[capture] ${viewport.key}: ${signInError}`);
      }
    }

    const screens = buildScreens({ developmentSlug, listingSlug, ownerListing: account.ownerListing });

    for (const screen of screens) {
      const page = await context.newPage();
      // Ошибки консоли и проваленные запросы собираем сразу: скриншот пустого
      // экрана без них не объясняет, почему он пустой.
      const consoleErrors = [];
      const failedRequests = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
      });
      page.on('requestfailed', (req) => failedRequests.push(`${req.method()} ${req.url().slice(0, 120)}`));

      const file = `${screen.id}-${viewport.key}.png`;
      let error = null;
      try {
        await page.goto(`${BASE_URL}${screen.path}`, { waitUntil: 'networkidle', timeout: 30_000 });
      } catch (err) {
        // networkidle не наступает, если на странице висит незавершённый запрос
        // к недоступному API. Это факт для отчёта, а не повод не снимать экран.
        error = String(err).split('\n')[0];
        await page.waitForTimeout(2000);
      }
      await page.screenshot({ path: resolve(OUT_DIR, file), fullPage: true });
      report.push({
        screen: screen.id,
        name: screen.name,
        viewport: viewport.key,
        path: screen.path,
        figmaFrame: screen.figmaFrame,
        data: screen.data,
        file,
        signedIn: Boolean(account.login) && !signInError,
        signInError,
        navigationError: error,
        consoleErrors: consoleErrors.slice(0, 5),
        failedRequests: failedRequests.slice(0, 5),
      });
      await page.close();
      process.stdout.write(`${file}${error ? ' (с ошибкой навигации)' : ''}\n`);
    }

    await context.close();
  }

  await browser.close();
  await writeFile(resolve(OUT_DIR, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\nснимков: ${report.length}, отчёт: ${resolve(OUT_DIR, 'capture-report.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
