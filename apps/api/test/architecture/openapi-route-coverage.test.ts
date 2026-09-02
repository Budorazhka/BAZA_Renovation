import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Опубликованный контракт и фактические маршруты обязаны совпадать.
 *
 * ЗАЧЕМ. Расхождение «документ против кода» в этом проекте уже стоило дорого:
 * 02.09.2026 выяснилось, что девять операций требуют `Idempotency-Key` на
 * сервере, а в OpenAPI объявляют `header?: never` — сгенерированный из спеки
 * клиент получил бы 400 вместо создания ресурса. Тогда же всплыло, что часть
 * эндпоинтов в спеке отсутствует вовсе, но насколько — никто не знал: вопрос
 * «сколько у нас недокументированных маршрутов» задать было нечем.
 *
 * Этот страж отвечает на него числом и держит его от роста.
 *
 * ДВЕ СТОРОНЫ, и обе важны:
 *
 * 1. **Мёртвое обещание** — путь есть в спеке, а в коде его нет. Клиент,
 *    сгенерированный из такой спеки, зовёт несуществующий эндпоинт и получает
 *    404. Таких быть не должно ни одного.
 * 2. **Недокументированный маршрут** — эндпоинт есть в коде, а в контракте
 *    его нет. Сгенерированный клиент про него не знает, и интеграция пишется
 *    по чтению исходников вместо контракта.
 *
 * Второе сейчас массовое, поэтому оформлено реестром: каждый пробел записан
 * поимённо с причиной. Реестр обязан совпадать с реальностью точно — новый
 * недокументированный маршрут уронит страж, и закрытый пробел, забытый в
 * реестре, уронит его тоже.
 */

const SRC_ROOT = join(__dirname, '../../src');
const SPEC_PATH = join(__dirname, '../../../../docs/api/v1-first-vertical-slice.yaml');

/**
 * Путь описан в контракте, но в коде этой ветки его нет.
 *
 * Это не норма, а видимое обещание: клиент, сгенерированный из спеки, зовёт
 * несуществующий эндпоинт и получает 404. Список обязан оставаться коротким и
 * пустеть, а не пополняться.
 *
 * Найдено самим стражем 02.09.2026 — и найдено правильным способом: локально
 * он проходил, потому что контроллер лежал в рабочем дереве незакоммиченным
 * (чужая ветка), а в CI его не было. Ровно та ловушка, про которую
 * предупреждает architecture.md, только с другой стороны: не тест без кода, а
 * контракт без кода.
 */
const SPEC_AHEAD_OF_CODE: Record<string, string> = {
  'GET /me':
    'описан в спеке 01.09.2026; контроллер живёт в ветке codex/erp-web и сюда пока не влит',
};

/** Маршрут → почему его нет и не должно быть в продуктовом контракте. */
const INTENTIONALLY_UNDOCUMENTED: Record<string, string> = {
  'GET /health': 'проба живости для оркестратора, не часть продуктового API',
  'GET /health/ready': 'проба готовности для оркестратора',
};

/**
 * Измеренный долг документации: маршрут → почему он пока не в спеке.
 *
 * Это не «сломано»: эндпоинты работают, покрыты правами и тестами. Это разрыв
 * между кодом и опубликованным контрактом, который до сегодняшнего дня никто
 * не измерял. Закрывать его следует пачками по модулям, вычёркивая строки
 * отсюда; страж проследит, чтобы список не пополнялся молча.
 */
const CONTRACT_GAPS: Record<string, string> = {};

function listControllers(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) files.push(...listControllers(fullPath));
    else if (entry.endsWith('.controller.ts')) files.push(fullPath);
  }
  return files;
}

/** `:taskId` в Nest — это `{taskId}` в OpenAPI; сравниваем в одной записи. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectControllerRoutes(): string[] {
  const routes = new Set<string>();

  for (const file of listControllers(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const base = source.match(/@Controller\(\s*'([^']*)'\s*\)/)?.[1] ?? '';

    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/);
      if (!match) continue;
      const path = '/' + [base, match[2] ?? ''].filter(Boolean).join('/');
      routes.add(`${match[1]!.toUpperCase()} ${toOpenApiPath(path)}`);
    }
  }

  return [...routes].sort();
}

/**
 * Разбор `paths:` построчно, без YAML-парсера: в apps/api его нет, а тянуть
 * зависимость ради двух уровней отступа не стоит. Форма спеки жёсткая — путь
 * на двух пробелах, метод на четырёх, — а «парсер молча вернул пустоту»
 * ловится проверкой на объём ниже.
 */
function collectSpecRoutes(): string[] {
  const routes = new Set<string>();
  let currentPath: string | null = null;

  for (const line of readFileSync(SPEC_PATH, 'utf8').split(/\r?\n/)) {
    const pathMatch = line.match(/^ {2}(\/[^:]*):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1]!;
      continue;
    }
    const methodMatch = line.match(/^ {4}(get|post|patch|put|delete):\s*$/);
    if (methodMatch && currentPath) {
      routes.add(`${methodMatch[1]!.toUpperCase()} ${currentPath}`);
    }
  }

  return [...routes].sort();
}

describe('Соответствие OpenAPI-контракта фактическим маршрутам', () => {
  const controllerRoutes = collectControllerRoutes();
  const specRoutes = collectSpecRoutes();

  it('оба разбора что-то нашли — защита от молчаливо сломанного парсера', () => {
    expect(controllerRoutes.length).toBeGreaterThan(100);
    expect(specRoutes.length).toBeGreaterThan(70);
  });

  it('в спеке нет мёртвых обещаний вне явного списка', () => {
    const inCode = new Set(controllerRoutes);
    const dead = specRoutes.filter((route) => !inCode.has(route));

    expect(dead.filter((route) => !(route in SPEC_AHEAD_OF_CODE))).toEqual([]);
  });

  it('недокументированные маршруты совпадают с реестром пробелов', () => {
    const documented = new Set(specRoutes);
    const known = new Set([
      ...Object.keys(CONTRACT_GAPS).map((key) => key.replace('ПРОБЕЛ: ', '')),
      ...Object.keys(INTENTIONALLY_UNDOCUMENTED),
    ]);

    const undocumented = controllerRoutes.filter((route) => !documented.has(route));

    // Новый маршрут мимо контракта — ошибка: либо описать в спеке, либо
    // внести в реестр осознанно.
    expect(undocumented.filter((route) => !known.has(route))).toEqual([]);

    // Пробел закрыт, но забыт в реестре — тоже ошибка: реестр перестанет
    // отражать реальность, и через месяц ему нельзя будет верить.
    const stale = [...known].filter((route) => !undocumented.includes(route)).sort();
    expect(stale).toEqual([]);
  });

  it('размер долга зафиксирован числом и молча вырасти не может', () => {
    // Число живёт здесь, а не выводится из длины реестра: иначе оно росло бы
    // вместе с ним и ничего не сторожило.
    expect(Object.keys(CONTRACT_GAPS)).toHaveLength(0);
  });
});
