import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACKNOWLEDGED_ONLY_EVENT_TYPES } from '../handlers/handlers.module';

/**
 * Страж соответствия: каждый eventType, который где-то ПУБЛИКУЕТСЯ в
 * outbox, обязан иметь зарегистрированный handler.
 *
 * Почему это важнее, чем кажется. OutboxPollerService, не найдя handler'а,
 * НЕ повторяет попытки — он сразу выставляет attempts = MAX_ATTEMPTS, то
 * есть отправляет событие прямо в dead_letter. Значит незарегистрированный
 * тип — это не «событие полежит и обработается позже», а гарантированная
 * строка в очереди сбоев на КАЖДУЮ публикацию.
 *
 * До 01.09.2026 так вели себя семь типов, включая рутинные TaskCreated,
 * TaskCompleted, UnitPriceChanged и UnitStatusChanged: dead_letter
 * наполнялся при обычной работе системы и переставал быть сигналом —
 * настоящий сбой (например провал PublicationRequested) утонул бы в шуме.
 *
 * Ни typecheck, ни обычные тесты этого не видят: публикация события и его
 * обработка связаны только строковым ключом. Ловится лишь сверкой двух
 * списков — она и автоматизирована здесь. Тот же grep-подход, что у
 * module-boundaries и permission-grants в apps/api.
 */

const WORKER_SRC = join(__dirname, '..');
const API_SRC = join(__dirname, '../../../api/src');
const HANDLERS_MODULE = join(__dirname, '../handlers/handlers.module.ts');

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    // Спеки исключены намеренно: там встречаются выдуманные типы вроде
    // 'TestEvent'/'UnknownEvent', которыми как раз и проверяется поведение
    // поллера на незнакомом событии.
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectPublishedEventTypes(): Map<string, string[]> {
  const published = new Map<string, string[]>();
  for (const root of [API_SRC, WORKER_SRC]) {
    for (const file of listSourceFiles(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/eventType:\s*'([A-Za-z._]+)'/g)) {
        const type = match[1]!;
        const where = relative(root, file).replace(/\\/g, '/');
        published.set(type, [...(published.get(type) ?? []), where]);
      }
    }
  }
  return published;
}

function collectRegisteredEventTypes(): Set<string> {
  const source = readFileSync(HANDLERS_MODULE, 'utf8');
  const registered = new Set<string>();
  for (const match of source.matchAll(/register\(\s*'([A-Za-z._]+)'/g)) {
    registered.add(match[1]!);
  }
  for (const type of ACKNOWLEDGED_ONLY_EVENT_TYPES) {
    registered.add(type);
  }
  return registered;
}

describe('Покрытие outbox-событий обработчиками', () => {
  const published = collectPublishedEventTypes();
  const registered = collectRegisteredEventTypes();

  it('каждое публикуемое событие имеет handler (иначе оно сразу уходит в dead_letter)', () => {
    const unhandled = [...published.entries()]
      .filter(([type]) => !registered.has(type))
      .map(([type, files]) => `${type} (публикуется в: ${[...new Set(files)].join(', ')})`);

    expect(unhandled).toEqual([]);
  });

  it('в списке «подтверждаем без эффекта» нет типов, которые нигде не публикуются', () => {
    const stale = ACKNOWLEDGED_ONLY_EVENT_TYPES.filter((type) => !published.has(type));

    expect(stale).toEqual([]);
  });

  it('сверка вообще что-то нашла — защита от молчаливо сломанного разбора', () => {
    expect(published.size).toBeGreaterThan(5);
    expect(registered.size).toBeGreaterThan(5);
  });
});
