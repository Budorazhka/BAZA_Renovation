import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Закрепляет список endpoint'ов, требующих `Idempotency-Key`.
 *
 * Зачем нужен именно тест, а не только документ: docs/api/conventions.md
 * ПРОТИВОРЕЧИЛ САМ СЕБЕ. Раздел 4 (со ссылкой на ADR-006) перечислял
 * publish/book/cancel/manual-ledger — четыре команды; раздел 8 —
 * publish/unpublish/book/cancel/reassign/manual-ledger, шесть. Код следовал
 * разделу 4, и понять, баг это или решение, по документу было нельзя.
 *
 * Расхождение разрешено 01.09.2026 в пользу раздела 4 (см. оговорку в §8
 * conventions.md): unpublish и reassign уже защищены от повторного
 * применения на уровне записи — условным update'ом и проверкой
 * expectedVersion соответственно, — и новой сущности не создают.
 *
 * Тест фиксирует РЕЗУЛЬТАТ этого решения: список ниже — исполняемая версия
 * документа. Добавление новой критической команды без ключа или снятие
 * ключа с существующей роняет тест, и автор обязан либо вернуть ключ, либо
 * осознанно обновить список вместе с §8 conventions.md.
 *
 * Тот же grep-подход, что у module-boundaries и permission-grants.
 */

const SRC_ROOT = join(__dirname, '../../src');

/** endpoint → почему ключ обязателен. */
const REQUIRE_IDEMPOTENCY_KEY: Record<string, string> = {
  'POST /bookings': 'book — создаёт новую бронь, дубль занял бы юнит дважды',
  'POST /bookings/:bookingId/cancel': 'cancel — ADR-006 прямо перечисляет',
  'POST /bookings/:bookingId/confirm': 'follow-up команда брони (book-001)',
  'POST /bookings/:bookingId/extend': 'follow-up команда брони (book-001)',
  'POST /developments/:developmentId/publish': 'publish — ADR-006 прямо перечисляет',
  'POST /property-assets/:assetId/listings/:listingId/publish': 'publish листинга',
  'POST /marketplace/property-assets/:assetId/listings/:listingId/publish':
    'publish листинга в marketplace-потоке',
};

function listControllers(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listControllers(fullPath));
    } else if (entry.endsWith('.controller.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Находит endpoint'ы, чей обработчик бросает IDEMPOTENCY_KEY_REQUIRED.
 * Метод и путь берутся из ближайшего ВЫШЕ по файлу декоратора маршрута —
 * так же, как их читает человек.
 */
function collectEndpointsRequiringKey(): string[] {
  const found: string[] = [];

  for (const file of listControllers(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const controllerBase = source.match(/@Controller\(\s*'([^']*)'\s*\)/)?.[1] ?? '';
    const lines = source.split(/\r?\n/);

    let currentRoute: { method: string; path: string } | null = null;
    for (const line of lines) {
      const route = line.match(/@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/);
      if (route) {
        currentRoute = { method: route[1]!.toUpperCase(), path: route[2] ?? '' };
        continue;
      }
      if (line.includes('IDEMPOTENCY_KEY_REQUIRED') && currentRoute) {
        const full = '/' + [controllerBase, currentRoute.path].filter(Boolean).join('/');
        found.push(`${currentRoute.method} ${full}`);
        currentRoute = null;
      }
    }
  }

  return found.sort();
}

describe('Покрытие критических команд Idempotency-Key', () => {
  const actual = collectEndpointsRequiringKey();
  const expected = Object.keys(REQUIRE_IDEMPOTENCY_KEY).sort();

  it('ключ требуют ровно те маршруты, что перечислены в conventions.md §8', () => {
    expect(actual).toEqual(expected);
  });

  it('сверка что-то нашла — защита от молчаливо сломанного разбора', () => {
    expect(actual.length).toBeGreaterThan(0);
  });

  it('у каждой записи списка есть причина и корректный формат маршрута', () => {
    for (const [endpoint, reason] of Object.entries(REQUIRE_IDEMPOTENCY_KEY)) {
      expect(reason.length).toBeGreaterThan(10);
      expect(endpoint).toMatch(/^(POST|PATCH|PUT|DELETE) \//);
    }
  });
});
