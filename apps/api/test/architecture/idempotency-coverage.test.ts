import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Требует ли каждая изменяющая состояние команда `Idempotency-Key`.
 *
 * ПОЧЕМУ ТЕСТ УСТРОЕН ИМЕННО ТАК. Первая редакция сравнивала «маршруты, которые
 * бросают IDEMPOTENCY_KEY_REQUIRED» со списком-константой. Такая сверка ловила
 * снятие ключа с известного маршрута, но НЕ ловила ровно ту регрессию, ради
 * которой заводилась: новая критическая команда, добавленная без проверки
 * ключа, не попадала ни в найденное, ни в ожидаемое — и тест проходил. Дыра
 * подтверждена диверсией: добавленный `POST /bookings/sabotage-transfer` без
 * идемпотентности прошёл стража насквозь.
 *
 * Поэтому источник перечня маршрутов теперь НЕЗАВИСИМ от их поведения: список
 * берётся из самих контроллеров (все не-GET маршруты), а решение по каждому
 * обязано быть записано в одной из двух таблиц ниже. Новый изменяющий маршрут
 * не попадает никуда и роняет тест — автор обязан принять решение, а не
 * промолчать.
 *
 * Третий страж такого рода после module-boundaries и permission-grants;
 * ADR-006 и conventions.md §4/§8 — источник правил.
 */

const SRC_ROOT = join(__dirname, '../../src');

/** Маршрут → почему ключ обязателен. Проверяется, что он ДЕЙСТВИТЕЛЬНО требуется. */
const REQUIRE_IDEMPOTENCY_KEY: Record<string, string> = {
  'POST /bookings': 'book — создаёт новую бронь, дубль занял бы юнит дважды',
  'POST /bookings/:bookingId/cancel': 'cancel — ADR-006 прямо перечисляет',
  'POST /bookings/:bookingId/confirm': 'follow-up команда брони (book-001)',
  'POST /bookings/:bookingId/extend': 'follow-up команда брони (book-001)',
  'POST /developments/:developmentId/publish': 'publish — ADR-006 прямо перечисляет',
  'POST /property-assets/:assetId/listings/:listingId/publish': 'publish листинга',
  'POST /marketplace/property-assets/:assetId/listings/:listingId/publish':
    'publish листинга в marketplace-потоке',
  'POST /leads': 'дубль лида искажает воронку и отчётность по менеджерам — данные, по которым принимают решения',
  'POST /deals': 'дубль сделки удваивает ожидаемую комиссию в отчётах',
  'POST /tasks': 'дубль задачи засоряет список следующих действий менеджера',
  'POST /marketplace/property-assets': 'дубль объекта в мастере публикации — клиент шлёт стабильный ключ на повтор шага',
  'POST /marketplace/property-assets/:assetId/listings': 'дубль листинга на том же объекте',
  'POST /property-assets': 'дубль объекта в ERP — клиент шлёт стабильный ключ на повтор формы',
  'POST /property-assets/:assetId/listings': 'дубль листинга на том же объекте (ERP)',
  'POST /developments': 'дубль ЖК — клиент шлёт стабильный ключ на повтор формы мастера',
  'POST /developments/:developmentId/buildings': 'дубль корпуса',
  'POST /buildings/:buildingId/sections': 'дубль секции',
  'POST /buildings/:buildingId/floors': 'дубль этажа',
  'POST /buildings/:buildingId/floor-plans': 'дубль планировки',
  'POST /floors/:floorId/units': 'дубль юнита — шахматка показала бы несуществующий лот',
  'POST /admin/accounts': 'дубль админ-аккаунта: второй аккаунт с админ-доступом на ту же identity',
};

/**
 * Маршрут → почему ключ НЕ требуется. Проверяется, что он и правда не требуется.
 *
 * Причина, начинающаяся с `ПРОБЕЛ:`, означает осознанно принятый риск, а не
 * безопасность: повтор такого запроса создаёт вторую сущность. Число таких
 * записей закреплено отдельной проверкой — молча вырасти оно не может.
 */
const NO_IDEMPOTENCY_KEY_NEEDED: Record<string, string> = {
  // --- Аутентификация ---
  'POST /auth/login': 'выдаёт сессию; повтор даёт новую сессию, а не дубль ресурса',
  'POST /auth/logout': 'идемпотентен по природе: повтор на закрытой сессии ничего не меняет',
  'POST /auth/register': 'повтор отклоняется уникальностью email на уровне БД',
  'POST /organizations/register': 'ПРОБЕЛ: дубль создаёт вторую организацию',

  // --- Команда и позиции ---
  'POST /team-users': 'ПРОБЕЛ: дубль создаёт вторую позицию',
  'POST /team-users/ensure-self': 'upsert по identity: повтор возвращает ту же позицию',
  'POST /team-users/ensure-team': 'upsert по организации: повтор возвращает ту же команду',
  'POST /team-users/invite/:token/activate': 'токен одноразовый, повтор отклоняется',
  'POST /team-users/positions/:positionId/assign': 'условный update позиции',
  'POST /team-users/positions/:positionId/vacate': 'условный update: повтор на свободной позиции — 409',
  'PATCH /team-users/positions/:positionId': 'обновление по id, повтор идемпотентен',
  'PATCH /team-users/positions/:positionId/avatar': 'перезапись ссылки на аватар',
  'PATCH /team-users/positions/:positionId/move': 'перемещение по id, повтор идемпотентен',
  'PATCH /team-users/positions/:positionId/status': 'установка статуса, повтор идемпотентен',
  'DELETE /team-users/positions/:positionId': 'удаление по id идемпотентно',
  'POST /organizations/:organizationId/positions/:positionId/assign': 'условный update позиции',
  'POST /organizations/:organizationId/positions/:positionId/grants':
    'грант идемпотентен по паре (subject, resource+action)',

  // --- Девелопмент ---
  'PATCH /developments/:developmentId': 'expectedVersion (CAS) не даст применить дважды',
  'PATCH /units/:unitId/price': 'expectedVersion (CAS)',
  'PATCH /units/:unitId/status': 'expectedVersion (CAS)',

  // --- Объекты и листинги (ERP-поток) ---
  'POST /property-assets/:assetId/listings/:listingId/unpublish':
    'условный update: modifiedCount === 0 → 409 (conventions.md §8)',
  'PATCH /property-assets/:assetId/listings/:listingId/activate': 'условный update по статусу',
  'PATCH /property-assets/:assetId/listings/:listingId/confirm-actuality':
    'проставляет отметку времени, повтор безвреден',
  'POST /property-assets/:assetId/media/upload-intent': 'ПРОБЕЛ: дубль создаёт второй media asset',
  'POST /property-assets/:assetId/media/:mediaAssetId/confirm': 'подтверждение по id, идемпотентно',
  'PATCH /property-assets/:assetId/media/:mediaAssetId': 'обновление по id, идемпотентно',
  'DELETE /property-assets/:assetId/media/:mediaAssetId': 'удаление по id идемпотентно',
  'PUT /property-assets/:assetId/media/order': 'полная замена порядка, идемпотентна',
  'POST /property-assets/duplicate-candidates/:duplicateCandidateId/override':
    'условный update кандидата, пишется audit',

  // --- Объекты и листинги (marketplace-поток, те же правила) ---
  'POST /marketplace/property-assets/:assetId/listings/:listingId/unpublish':
    'условный update: modifiedCount === 0 → 409',
  'PATCH /marketplace/property-assets/:assetId/listings/:listingId/activate': 'условный update по статусу',
  'PATCH /marketplace/property-assets/:assetId/listings/:listingId/confirm-actuality':
    'проставляет отметку времени, повтор безвреден',
  'POST /marketplace/property-assets/:assetId/media/upload-intent':
    'ПРОБЕЛ: дубль создаёт второй media asset',
  'POST /marketplace/property-assets/:assetId/media/:mediaAssetId/confirm': 'подтверждение по id',
  'PATCH /marketplace/property-assets/:assetId/media/:mediaAssetId': 'обновление по id',
  'DELETE /marketplace/property-assets/:assetId/media/:mediaAssetId': 'удаление по id идемпотентно',
  'PUT /marketplace/property-assets/:assetId/media/order': 'полная замена порядка',
  'POST /marketplace/property-assets/duplicate-candidates/:duplicateCandidateId/override':
    'условный update кандидата, пишется audit',

  // --- Медиа ---
  'POST /media/upload-intent': 'ПРОБЕЛ: дубль создаёт второй media asset',
  'POST /media/:assetId/confirm': 'подтверждение по id, идемпотентно',

  // --- CRM ---
  'POST /leads/:leadId/assign': 'условный update владельца',
  'PATCH /leads/:leadId/stage': 'переход стадии условный, повтор не применяется дважды',
  'PATCH /deals/:dealId': 'expectedVersion (CAS)',
  'PATCH /deals/:dealId/stage': 'expectedVersion (CAS)',
  'PATCH /deals/:dealId/checklist': 'expectedVersion (CAS)',
  'PATCH /deals/:dealId/reassign': 'expectedVersion (CAS) — см. conventions.md §8',
  'POST /deals/:dealId/participants': 'участник уникален по contactId в рамках сделки',
  'DELETE /deals/:dealId/participants/:contactId': 'удаление по id идемпотентно',
  'PATCH /tasks/:taskId': 'expectedVersion (CAS)',
  'PATCH /tasks/:taskId/reassign': 'expectedVersion (CAS)',
  'POST /tasks/:taskId/complete': 'повторное завершение намеренно идемпотентно',

  // --- Публичный контур ---
  'POST /public/developments/:slug/reveal-contact':
    'своя запись идемпотентности (public-reveal-idempotency-record)',
  'POST /public/listings/:slug/reveal-contact': 'своя запись идемпотентности',

  // --- Админ ---
  'POST /admin/accounts/:adminAccountId/deactivate': 'условный update по статусу',
  'POST /admin/accounts/:adminAccountId/reactivate': 'условный update по статусу',
  'POST /admin/accounts/:adminAccountId/grants': 'грант идемпотентен по (account, resource+action)',
  'POST /admin/accounts/:adminAccountId/grants/:grantId/revoke': 'условный update гранта',
  'POST /admin/duplicate-candidates/:duplicateCandidateId/confirm': 'условный update кандидата',
  'POST /admin/publications/:publicationId/unpublish': 'условный update (conventions.md §8)',
};

/** Сколько записей помечено `ПРОБЕЛ:`. Рост числа обязан быть осознанным. */
const KNOWN_GAPS = 5;

interface RouteInfo {
  key: string;
  enforcesKey: boolean;
}

function listControllers(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) files.push(...listControllers(fullPath));
    else if (entry.endsWith('.controller.ts')) files.push(fullPath);
  }
  return files;
}

/**
 * Все изменяющие состояние маршруты (не-GET) и признак того, требует ли
 * обработчик `Idempotency-Key`. Перечень маршрутов НЕ зависит от наличия
 * проверки — в этом весь смысл: иначе незащищённый маршрут был бы невидим.
 */
function collectMutatingRoutes(): RouteInfo[] {
  const routes = new Map<string, boolean>();

  for (const file of listControllers(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const controllerBase = source.match(/@Controller\(\s*'([^']*)'\s*\)/)?.[1] ?? '';
    const lines = source.split(/\r?\n/);

    let current: string | null = null;
    for (const line of lines) {
      const route = line.match(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/);
      if (route) {
        const method = route[1]!.toUpperCase();
        if (method === 'GET') {
          current = null;
          continue;
        }
        const path = '/' + [controllerBase, route[2] ?? ''].filter(Boolean).join('/');
        current = `${method} ${path}`;
        if (!routes.has(current)) routes.set(current, false);
        continue;
      }
      if (current && line.includes('IDEMPOTENCY_KEY_REQUIRED')) {
        routes.set(current, true);
        current = null;
      }
    }
  }

  return [...routes].map(([key, enforcesKey]) => ({ key, enforcesKey })).sort((a, b) => a.key.localeCompare(b.key));
}

describe('Покрытие изменяющих команд Idempotency-Key', () => {
  const routes = collectMutatingRoutes();
  const required = new Set(Object.keys(REQUIRE_IDEMPOTENCY_KEY));
  const exempt = new Set(Object.keys(NO_IDEMPOTENCY_KEY_NEEDED));

  it('разбор контроллеров что-то нашёл — защита от молчаливо сломанного парсера', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('каждый изменяющий маршрут классифицирован: требует ключ либо явно освобождён', () => {
    const unclassified = routes
      .map((r) => r.key)
      .filter((key) => !required.has(key) && !exempt.has(key));

    expect(unclassified).toEqual([]);
  });

  it('маршруты из списка обязательных действительно требуют ключ', () => {
    const declaredButNotEnforced = routes
      .filter((r) => required.has(r.key) && !r.enforcesKey)
      .map((r) => r.key);

    expect(declaredButNotEnforced).toEqual([]);
  });

  it('освобождённые маршруты ключ не требуют — иначе список разошёлся с кодом', () => {
    const exemptButEnforcing = routes
      .filter((r) => exempt.has(r.key) && r.enforcesKey)
      .map((r) => r.key);

    expect(exemptButEnforcing).toEqual([]);
  });

  it('в списках нет маршрутов, которых больше нет в коде', () => {
    const live = new Set(routes.map((r) => r.key));
    const stale = [...required, ...exempt].filter((key) => !live.has(key)).sort();

    expect(stale).toEqual([]);
  });

  it('число осознанно принятых пробелов не выросло молча', () => {
    const gaps = Object.values(NO_IDEMPOTENCY_KEY_NEEDED).filter((r) => r.startsWith('ПРОБЕЛ:'));

    expect(gaps.length).toBe(KNOWN_GAPS);
  });

  it('у каждой записи есть причина и корректный формат маршрута', () => {
    for (const [endpoint, reason] of Object.entries({
      ...REQUIRE_IDEMPOTENCY_KEY,
      ...NO_IDEMPOTENCY_KEY_NEEDED,
    })) {
      expect(reason.length).toBeGreaterThan(10);
      expect(endpoint).toMatch(/^(POST|PATCH|PUT|DELETE) \//);
    }
  });
});
