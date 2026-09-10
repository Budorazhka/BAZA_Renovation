import 'reflect-metadata';
// Side-effect-only импорты, та же причина, что в actuality-expire.command.ts:
// ambient-типы плагинов Fastify регистрирует только main.api.ts, а ts-node
// типизирует граф этого entrypoint'а отдельно.
import '@fastify/cookie';
import '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { DefaultGrantsBackfillService } from '../modules/organizations/default-grants-backfill.service';

/**
 * Доливка стартовых грантов ролей (DEFAULT_ROLE_GRANTS) в уже существующие
 * позиции — см. DefaultGrantsBackfillService. Не расписание, а разовая
 * команда: запускать после выкладки релиза, который добавил записи в
 * DEFAULT_ROLE_GRANTS, и после переноса организаций со старой системы.
 * Сначала `--dry-run`: отчёт тот же, записи нет.
 *
 *   pnpm --filter @baza/api run grants:backfill-defaults -- --dry-run
 *   pnpm --filter @baza/api run grants:backfill-defaults
 *
 * В образе API (compose):
 *   docker compose -f infrastructure/compose/compose.runtime.yml run --rm api \
 *     node apps/api/dist/jobs/grants-backfill.command.js --dry-run
 *
 * Параллельно с самим собой не запускать: каждая позиция перечитывается в
 * транзакции, но два одновременных прогона всё же могут долить одну пару
 * дважды (дубль безвреден для проверки прав, но засоряет список грантов).
 *
 * Код выхода 1 при `errors > 0`.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('GrantsBackfillCommand');
  // Голый `--` отбрасываем: часть версий pnpm передаёт его в скрипт как есть.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const unknown = args.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(`Неизвестные аргументы: ${unknown.join(' ')}. Поддерживается только --dry-run`);
  }
  const dryRun = args.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const service = app.get(DefaultGrantsBackfillService);
    const report = await service.backfill({ dryRun });
    logger.log(`${dryRun ? '[DRY RUN] ' : ''}default grants backfill finished: ${JSON.stringify(report, null, 2)}`);
    if (report.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during default grants backfill command', err);
  process.exit(1);
});
