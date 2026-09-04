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
 * Экраны в терминах гейта. `figmaFrame` — фрейм, с которым потом сверяют, чтобы
 * человек не искал ID заново. `data` говорит, откуда экран берёт содержимое:
 * это меняет смысл скриншота (см. README рядом со снимками).
 */
const SCREENS = [
  { id: 'MKT-SCR-001', name: 'Главная (информационная)', path: '/', figmaFrame: '3428:55239 / 1035:18101', data: 'static' },
  { id: 'MKT-SCR-004', name: 'Каталог новостроек (список)', path: '/newconstructions', figmaFrame: '236:27197 / 4182:72529', data: 'api' },
  { id: 'MKT-SCR-005', name: 'Каталог новостроек (карта)', path: '/newconstructions?view=map', figmaFrame: '236:26596 / 3854:67902', data: 'api' },
  { id: 'MKT-SCR-010', name: 'Каталог вторички', path: '/secondary', figmaFrame: '236:27197 / 3854:62977', data: 'api' },
  { id: 'MKT-SCR-011', name: 'Каталог аренды', path: '/rent', figmaFrame: '236:27197 / 4182:69880', data: 'api' },
  { id: 'MKT-SCR-014', name: 'Рейтинг риэлторов', path: '/realtors', figmaFrame: '3576:53108 / 3699:60246', data: 'fixture' },
  { id: 'MKT-SCR-015', name: 'Профиль риэлтора', path: '/realtors/1', figmaFrame: '3576:53737 / 3699:60823', data: 'fixture' },
  { id: 'MKT-SCR-016', name: 'Запросы клиентов', path: '/requests', figmaFrame: '2287:34150', data: 'fixture' },
  { id: 'MKT-SCR-017', name: 'Избранное', path: '/favorites', figmaFrame: '1376:19390 / 1376:19776', data: 'fixture' },
  { id: 'MKT-SCR-018', name: 'Подборки объектов', path: '/selections', figmaFrame: '1311:18621 / 1311:18671', data: 'fixture' },
  { id: 'MKT-SCR-019', name: 'Кабинет: мои объекты', path: '/account/properties', figmaFrame: '5071:68119 / 5071:68253', data: 'fixture' },
  { id: 'MKT-SCR-020', name: 'Мастер публикации', path: '/publish', figmaFrame: 'не назначен', data: 'api' },
];

/** Ровно два брейкпоинта Figma: промежуточного tablet в файле нет. */
const VIEWPORTS = [
  { key: 'desktop', width: 1920, height: 1080 },
  { key: 'mobile', width: 375, height: 812 },
];

/**
 * Заводит сессию и отдаёт её в виде storageState для браузера.
 *
 * Без входа половина списка снимется как форма логина: разделы кабинета
 * закрыты `RequireAuth`. Снимок формы входа вместо кабинета — не тот материал,
 * по которому сверяют вёрстку.
 *
 * Возвращает `null`, если войти не удалось (например упёрлись в лимит
 * регистраций — пять в минуту на IP): тогда снимки просто делаются гостем, и
 * это честно записывается в отчёт, а не выдаётся за кабинет.
 */
async function createSignedInState() {
  const login = `capture-${Date.now()}@example.com`;
  const password = 'Correct-Horse-Battery-Staple-1!';
  const api = await apiRequest.newContext({ baseURL: `${API_URL}${API_BASE_PATH}` });
  try {
    const registered = await api.post('/auth/register', { data: { login, password } });
    if (registered.status() !== 201) return null;
    const loggedIn = await api.post('/auth/login', {
      data: { login, password },
      headers: { Origin: BASE_URL },
    });
    if (loggedIn.status() !== 200 && loggedIn.status() !== 201) return null;
    return await api.storageState();
  } catch {
    return null;
  } finally {
    await api.dispose();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const storageState = await createSignedInState();
  if (!storageState) {
    console.warn('[capture] Войти не удалось — разделы кабинета снимутся как форма входа.');
  }
  const browser = await chromium.launch();
  const report = [];

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      ...(storageState ? { storageState } : {}),
    });

    for (const screen of SCREENS) {
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
        signedIn: Boolean(storageState),
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
