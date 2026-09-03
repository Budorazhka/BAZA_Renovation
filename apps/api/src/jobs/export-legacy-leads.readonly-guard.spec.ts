import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `[lead-legacy-export-tool]`: read-only гарантия. Владелец продукта
 * явно подтвердил: инструмент экспорта лидов из легаси-backend
 * (`api-crm.baza.sale`, реальный, работающий в проде сервис) обязан быть
 * СТРОГО read-only. Этот тест — проверяемая, а не декларативная гарантия:
 * grep исходников (`export-legacy-leads.script.ts` и всё в
 * `legacy-lead-export/`) на мутирующие HTTP-методы/вызовы, тот же
 * grep-based подход, что architecture-тесты (см. module-boundaries.test.ts
 * докстринг за обоснованием).
 *
 * Ищем:
 *  - `method: 'POST'|'PUT'|'PATCH'|'DELETE'` (в любом регистре) как опцию
 *    `fetch(...)`;
 *  - вызовы `.post(`/`.put(`/`.patch(`/`.delete(` (на случай появления
 *    HTTP-клиента вроде axios с методными хелперами).
 */
const TARGET_DIR = join(__dirname);
const ADDITIONAL_FILES = [join(__dirname, 'export-legacy-leads.script.ts')];

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFilesRecursive(fullPath));
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('export-legacy-leads: read-only гарантия', () => {
  const files = Array.from(
    new Set([...listTsFilesRecursive(join(TARGET_DIR, 'legacy-lead-export')), ...ADDITIONAL_FILES]),
  );

  it('нашлись файлы для проверки (страховка от пустого glob)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s не содержит мутирующих HTTP-вызовов к легаси-backend', (filePath) => {
    const content = readFileSync(filePath, 'utf-8');

    const mutatingMethodOption = /method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/i;
    expect(content).not.toMatch(mutatingMethodOption);

    const mutatingHelperCall = /\.(post|put|patch|delete)\s*\(/i;
    expect(content).not.toMatch(mutatingHelperCall);
  });
});
