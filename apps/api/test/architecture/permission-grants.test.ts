import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEFAULT_ROLE_GRANTS } from '../../src/modules/organizations/default-role-grants';

/**
 * Страж соответствия между тем, какие права ПРОВЕРЯЮТСЯ в контроллерах, и
 * тем, какие права ВЫДАЮТСЯ ролям в DEFAULT_ROLE_GRANTS.
 *
 * Расхождение возможно в обе стороны, и обе уже случались в этом проекте:
 *
 *  1. Право проверяется, но не выдано никому — эндпоинт отвечает 403 всем
 *     и всегда. Так и было с `media_asset.upload` (найдено 01.09.2026):
 *     загрузить план этажа, фото юнита, документ агентства или аватар было
 *     нельзя вообще, потому что POST /media/upload-intent требовал право,
 *     которого не было ни у одной роли.
 *
 *  2. Право выдано, но нигде не проверяется — заявленная возможность
 *     существует только на бумаге. Так было с `chessboard.export`,
 *     `client.reassign` и `export.run`, пока их не реализовали.
 *
 * Ни typecheck, ни обычные тесты такое не ловят: код компилируется и
 * проходит, просто соответствующая функциональность не работает. Ловится
 * только сверкой двух списков — она и автоматизирована здесь.
 *
 * Тот же grep-подход и та же мотивация, что у module-boundaries.test.ts:
 * простая статическая проверка по исходникам без внешних зависимостей.
 */

const SRC_ROOT = join(__dirname, '../../src');

/**
 * Права, которые СОЗНАТЕЛЬНО выданы без реализации. Список намеренно
 * явный: попадание сюда — решение, а не умолчание, и каждая запись обязана
 * объяснять причину. Реализовали — убрали отсюда.
 */
const INTENTIONALLY_UNIMPLEMENTED: Record<string, string> = {
  'finance.read':
    'Финансового модуля нет вообще — ни таблиц, ни эндпоинтов. Грант описывает будущий раздел.',
  'manual_ledger.read':
    'То же: ручных проводок как сущности не существует, реализация не начиналась.',
  'lead.reassign':
    'Функционально полностью перекрыт POST /leads/:leadId/assign (lead.assign), который меняет ' +
    'ownerPositionId независимо от текущего значения. Отдельный эндпоинт добавил бы дублирующую ' +
    'поверхность без нового поведения — см. docs/operations/deal-client-reassign.md.',
};

function listTsFilesRecursive(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listTsFilesRecursive(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Права, реально проверяемые декоратором, с указанием файла — для внятного сообщения об ошибке. */
function collectEnforcedPermissions(): Map<string, string[]> {
  const enforced = new Map<string, string[]>();
  for (const file of listTsFilesRecursive(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/RequirePermission\(\s*'([^']+)'\s*,\s*'([^']+)'/g)) {
      const key = `${match[1]}.${match[2]}`;
      const where = relative(SRC_ROOT, file).replace(/\\/g, '/');
      enforced.set(key, [...(enforced.get(key) ?? []), where]);
    }
  }
  return enforced;
}

function collectGrantedPermissions(): Set<string> {
  const granted = new Set<string>();
  for (const grants of Object.values(DEFAULT_ROLE_GRANTS)) {
    for (const grant of grants) {
      granted.add(`${grant.resource}.${grant.action}`);
    }
  }
  return granted;
}

describe('Соответствие проверяемых прав и выдаваемых грантов', () => {
  const enforced = collectEnforcedPermissions();
  const granted = collectGrantedPermissions();

  it('каждое проверяемое право выдано хотя бы одной роли (иначе эндпоинт мёртв для всех)', () => {
    const unreachable = [...enforced.entries()]
      .filter(([permission]) => !granted.has(permission))
      .map(([permission, files]) => `${permission} (проверяется в: ${files.join(', ')})`);

    expect(unreachable).toEqual([]);
  });

  it('каждый выданный грант либо проверяется в коде, либо явно записан как нереализованный', () => {
    const dead = [...granted].filter(
      (permission) => !enforced.has(permission) && !(permission in INTENTIONALLY_UNIMPLEMENTED),
    );

    expect(dead).toEqual([]);
  });

  it('в списке нереализованных нет записей, которые уже реализованы — он не должен устаревать', () => {
    const stale = Object.keys(INTENTIONALLY_UNIMPLEMENTED).filter((permission) => enforced.has(permission));

    expect(stale).toEqual([]);
  });

  it('media_asset.upload выдан ровно тем ролям, у которых есть property_asset.edit', () => {
    const rolesWithAssetEdit = Object.entries(DEFAULT_ROLE_GRANTS)
      .filter(([, grants]) => grants.some((g) => g.resource === 'property_asset' && g.action === 'edit'))
      .map(([role]) => role)
      .sort();
    const rolesWithMediaUpload = Object.entries(DEFAULT_ROLE_GRANTS)
      .filter(([, grants]) => grants.some((g) => g.resource === 'media_asset' && g.action === 'upload'))
      .map(([role]) => role)
      .sort();

    expect(rolesWithMediaUpload).toEqual(rolesWithAssetEdit);
  });
});
