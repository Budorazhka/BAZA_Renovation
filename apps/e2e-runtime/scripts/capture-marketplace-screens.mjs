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
 * Заводит объект и объявление от лица уже вошедшего браузера.
 *
 * Запросы идут через `context.request`, который делит хранилище cookie с
 * браузерным контекстом: отдельный вход не нужен и не делается. `Origin`
 * обязателен — аудитория продукта резолвится из него (ADR-004), а
 * `context.request` сам его не проставляет; без заголовка сессия не находится
 * и приходит 401.
 *
 * Без объекта кабинет снимается пустым состоянием, а страницу редактирования
 * снять нельзя вовсе: её адрес состоит из идентификаторов объекта.
 */
async function seedOwnerListing(context) {
  const headers = { Origin: BASE_URL };
  try {
    const asset = await context.request.post(apiUrl('/marketplace/property-assets'), {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
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

    const listing = await context.request.post(apiUrl(`/marketplace/property-assets/${assetId}/listings`), {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { dealType: 'sale', price: { amountMinorUnits: 9_200_000, currency: 'USD' } },
    });
    if (listing.status() !== 201) return null;

    return { assetId, listingId: (await listing.json())._id };
  } catch {
    // Съёмка не должна падать из-за засева: без объекта снимутся пустые
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
 * Регистрирует аккаунт для съёмки. Вход НЕ делает.
 *
 * Это принципиально. Пока съёмка логинилась по API, а потом ещё раз в
 * браузере, разделы кабинета снимались формой входа — четыре прогона подряд, в
 * трёх разных вариантах передачи сессии. Сквозной сценарий мастера публикации
 * при этом держит сессию в браузере и проходит; отличался он ровно одним:
 * там вход в браузере был для аккаунта ПЕРВЫМ.
 *
 * Почему второй вход даёт сессию, которая не работает, я не выяснил — это
 * открытый вопрос к самому входу, а не к съёмке. Съёмке достаточно не создавать
 * второй: `POST /auth/register` сессию не создаёт (см. auth.controller.ts), так
 * что единственным входом остаётся браузерный.
 *
 * Ожидание на 429 нужно: лимит в пять регистраций в минуту на IP общий, а
 * съёмка идёт следом за сквозными сценариями с того же адреса.
 */
async function registerCaptureAccount() {
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
        return { login: null, password: null, reason: `register ${registered.status()}: ${(await registered.text()).slice(0, 200)}` };
      }
      return { login, password, reason: null };
    }
    return { login: null, password: null, reason: 'register 429: лимит не отпустил за четыре попытки' };
  } catch (err) {
    return { login: null, password: null, reason: String(err).split('\n')[0] };
  } finally {
    await api.dispose();
  }
}

/**
 * Вход через форму, в том же браузерном контексте, в котором потом снимаем.
 *
 * Cookie ставит сам браузер, поэтому её атрибуты заведомо те, с которыми она
 * работает в жизни. Разделы кабинета закрыты `RequireAuth`, и без этого шага
 * половина списка снимается формой входа.
 */
async function signInThroughUi(context, credentials) {
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByTestId('auth-input-login').fill(credentials.login);
    await page.getByTestId('auth-input-password').fill(credentials.password);

    // `/auth/login` ограничен десятью запросами в минуту на IP, и съёмка идёт
    // следом за сквозными сценариями с того же адреса — на 429 ждём и жмём
    // снова, а не считаем отказом.
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

    // Форма исчезла — но этого мало. На прогоне 2886aeb она исчезла, а снимки
    // всё равно вышли гостевыми: сессия жила только до конца этой страницы.
    // Поэтому спрашиваем ещё раз, уже от контекста, и с `Origin`: без него
    // аудитория продукта не резолвится и придёт 401 даже при живой сессии.
    const check = await context.request
      .get(apiUrl('/auth/session'), { headers: { Origin: BASE_URL } })
      .catch(() => null);
    if (!check || check.status() !== 200) {
      return `форма исчезла, но сессия в контексте не живёт: GET /auth/session -> ${check ? check.status() : 'нет ответа'}`;
    }
    return null;
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
     * Свой аккаунт на каждый брейкпоинт, и ровно один вход у каждого.
     *
     * Порядок здесь важен и выстрадан. Регистрация сессии не создаёт, поэтому
     * браузерный вход оказывается для аккаунта первым и единственным. Объект
     * заводится уже после входа, через `context.request`, который делит cookie
     * с браузером, — то есть второй вход не нужен нигде.
     *
     * Что не сработало до этого: перенос cookie из HTTP-клиента в браузер
     * (5d4943a), перенос состояния между браузерными контекстами (66ea5f9),
     * вход по разу на контекст поверх входа по API (2886aeb и cff2ed6). Во всех
     * случаях кабинет снимался формой входа. Общим у них был лишний вход по
     * API перед браузерным; сквозной сценарий мастера публикации, который
     * сессию держит, обходится без него.
     */
    const account = await registerCaptureAccount();
    let signInError = account.login ? null : account.reason;
    let ownerListing = null;
    if (!account.login) {
      console.warn(`[capture] ${viewport.key}: аккаунт не завёлся (${account.reason}) — кабинет снимется формой входа.`);
    } else {
      const uiError = await signInThroughUi(context, account);
      if (uiError) {
        signInError = `вход через форму: ${uiError}`;
        console.warn(`[capture] ${viewport.key}: ${signInError}`);
      } else {
        ownerListing = await seedOwnerListing(context);
        if (!ownerListing) {
          console.warn(`[capture] ${viewport.key}: объект сессии не завёлся — кабинет снимется пустым.`);
        }
      }
    }

    const screens = buildScreens({ developmentSlug, listingSlug, ownerListing });

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
