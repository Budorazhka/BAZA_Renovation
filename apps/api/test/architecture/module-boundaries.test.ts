import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architecture dependency test — C-03 обязательное требование.
 * Проверяет, что:
 *  1. Модули не импортируют repository-классы других модулей напрямую
 *     (общение только через сервисы/events, ADR-001).
 *  2. Ни один файл вне папки repository/ не импортирует mongoose-модели
 *     напрямую (ADR-002 требование 2 — единственная точка доступа к
 *     MongoDB для tenant-коллекций — repository layer).
 *
 * Намеренно НЕ использует внешнюю библиотеку вроде dependency-cruiser —
 * простой grep-based тест по исходникам достаточен для текущего размера
 * кодовой базы и не требует дополнительной зависимости на этом этапе.
 * Заменяется на более строгий инструмент, если правил станет заметно больше.
 */

const SRC_ROOT = join(__dirname, '../../src');
const MODULES_ROOT = join(SRC_ROOT, 'modules');

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTsFilesRecursive(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getModuleName(filePath: string): string | null {
  const rel = relative(MODULES_ROOT, filePath);
  const segments = rel.split(/[\\/]/);
  return segments.length > 0 ? segments[0]! : null;
}

function extractImportPaths(fileContent: string): string[] {
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(fileContent)) !== null) {
    paths.push(match[1]!);
  }
  return paths;
}

describe('Architecture: module boundaries (ADR-001, ADR-002)', () => {
  let allModuleFiles: string[] = [];
  let allSrcFiles: string[] = [];

  beforeAll(() => {
    try {
      allModuleFiles = listTsFilesRecursive(MODULES_ROOT);
    } catch {
      // modules/ может быть частично пустым на раннем этапе C-03 —
      // тест не должен падать на отсутствии директории, только на
      // найденных нарушениях, когда файлы появятся.
      allModuleFiles = [];
    }
    allSrcFiles = listTsFilesRecursive(SRC_ROOT);
  });

  it('модуль не импортирует *.repository.ts другого модуля напрямую', () => {
    const violations: string[] = [];

    for (const file of allModuleFiles) {
      const ownModule = getModuleName(file);
      if (!ownModule) continue;

      const content = readFileSync(file, 'utf-8');
      const imports = extractImportPaths(content);

      for (const importPath of imports) {
        if (!importPath.includes('.repository') && !importPath.match(/repository/i)) {
          continue;
        }
        // Относительный импорт вида ../../other-module/xxx.repository
        const isCrossModule = importPath.includes('../') && !importPath.includes(`/${ownModule}/`);
        if (isCrossModule) {
          violations.push(
            `${relative(SRC_ROOT, file)}: импортирует repository другого модуля (${importPath})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('файлы вне */repository/* не импортируют mongoose Model напрямую', () => {
    const violations: string[] = [];

    for (const file of allSrcFiles) {
      const rel = relative(SRC_ROOT, file);
      if (rel.includes('repository')) continue;

      const content = readFileSync(file, 'utf-8');
      // Прямой импорт схемы/модели из mongoose минуя InjectModel в repository —
      // допустимо только InjectConnection в health-check (единственное известное
      // легитимное исключение, явно проверяется отдельно).
      const hasDirectModelUsage = /import\s+.*\bModel\b.*from\s+['"]mongoose['"]/.test(content);

      if (hasDirectModelUsage && !rel.includes('health')) {
        violations.push(`${rel}: импортирует mongoose Model вне repository layer`);
      }
    }

    expect(violations).toEqual([]);
  });
});
