#!/usr/bin/env node
/**
 * CI breaking-change gate (CLAUDE_HANDOFF_TZ.md C-04: "stale generated
 * output fails CI"). Регенерирует schema.ts во временный файл и сравнивает
 * с закоммиченной версией — расхождение значит, что OpenAPI-спека
 * изменилась, но `pnpm generate` не был запущен и результат не закоммичен.
 * Не полагается на git diff (репозиторий может быть checked out в CI без
 * полной истории) — прямое сравнение содержимого файлов.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const committedSchemaPath = join(packageDir, 'src', 'schema.ts');
const specPathAbsolute = join(packageDir, '..', '..', '..', 'docs', 'api', 'v1-first-vertical-slice.yaml');

// Не через node_modules/.bin/openapi-typescript — на Windows это POSIX
// shell-shim, не исполняемый напрямую через `node <shim>` (SyntaxError:
// Invalid or unexpected token — Node пытается распарсить shell-скрипт как
// JS). Реальный CLI-entrypoint пакета — bin/cli.js, резолвится напрямую.
const cliEntrypoint = join(packageDir, 'node_modules', 'openapi-typescript', 'bin', 'cli.js');

// @redocly/openapi-core (используется openapi-typescript под капотом) ломает
// resolve на абсолютных путях с non-ASCII символами (например, кириллицей в
// пути пользователя на Windows) — percent-encoding где-то во внутреннем
// file:// URL round-trip не совпадает при decode. Относительные пути от cwd
// этой проблемы не имеют — воспроизведено и проверено вручную перед фиксом.
process.chdir(packageDir);
const specPath = relative(packageDir, specPathAbsolute);

const tempDir = mkdtempSync(join(tmpdir(), 'baza-api-client-check-'));
const tempSchemaPath = relative(packageDir, join(tempDir, 'schema.ts'));

try {
  execFileSync('node', [cliEntrypoint, specPath, '-o', tempSchemaPath], { stdio: 'inherit' });

  const committed = readFileSync(committedSchemaPath, 'utf-8');
  const fresh = readFileSync(tempSchemaPath, 'utf-8');

  if (committed !== fresh) {
    console.error(
      '\n❌ packages/api-client/src/schema.ts устарел относительно docs/api/v1-first-vertical-slice.yaml.\n' +
        '   Запустите `pnpm --filter @baza/api-client generate` и закоммитьте результат.\n',
    );
    process.exit(1);
  }

  console.log('✅ packages/api-client/src/schema.ts актуален относительно OpenAPI-спеки.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
