import 'reflect-metadata';
// Side-effect-only импорт: FastifyReply.setCookie/clearCookie (использованы
// в auth.controller.ts, часть AppModule-графа через IdentityModule) —
// ambient type augmentation из @fastify/cookie, которую иначе регистрирует
// только main.api.ts. ts-node типизирует граф ЭТОГО entrypoint'а независимо
// от main.api.ts (не общий compile всего src/** сразу, в отличие от
// `tsc --noEmit`), без этой строки `pnpm run actuality:expire-overdue`
// падает на TS2339 до старта bootstrap — найдено реальным прогоном команды,
// не гипотетически.
import '@fastify/cookie';
// То же для @fastify/multipart (req.isMultipart/req.file в
// lead-import.controller.ts, импорт лидов 03.09.2026): без него
// `pnpm run actuality:expire-overdue` снова падал на TS2339. Найдено 11.09
// реальным прогоном соседней booking-expire.command.ts; compose это не ловил —
// он запускает скомпилированный dist, где main.api.ts в том же проекте.
import '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ActualityService } from '../modules/property-assets/actuality.service';

/**
 * Standalone command, тот же паттерн, что apps/worker/src/jobs/media-
 * cleanup.command.ts (см. её докстринг): в кодовой базе нет ни одной
 * scheduling-зависимости (@nestjs/schedule и т.п.), заводить её только
 * ради одной batch-команды означало бы новый паттерн, не решение владельца.
 * Внешний cron (ops, вне кодовой базы, инфраструктура — отдельное решение
 * при деплое) вызывает `pnpm --filter api run actuality:expire-overdue` по
 * расписанию — эта команда лишь делает саму операцию invokable, не решает,
 * КОГДА её вызывать.
 *
 * ActualityService.expireOverdueListings — раньше вызывалась только из
 * интеграционного теста (см. её докстринг "НЕ подключена ни к какому cron/
 * scheduler") — просроченные listing'и не снимались с публикации
 * автоматически ни при каких обстоятельствах ни в одном окружении. Эта
 * команда не меняет саму бизнес-логику ActualityService — только даёт ей
 * вызываемую точку входа вне HTTP и вне интеграционных тестов.
 *
 * Полный AppModule (не ручной минимальный набор providers, как у
 * media-cleanup) — ActualityService зависит от ЛОКАЛЬНОГО (не workspace-
 * пакетного) apps/api PublicationService, у которого свой собственный
 * граф зависимостей (outbox, audit, publication repository); переиспользовать
 * уже проверенную сборку AppModule надёжнее, чем вручную повторять этот
 * граф и рисковать пропустить транзитивную зависимость. NestFactory.
 * createApplicationContext не поднимает HTTP-адаptер и не слушает порт —
 * контроллеры регистрируются в DI-графе, но никогда не становятся
 * достижимы по сети в этом процессе.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('ActualityExpireCommand');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const service = app.get(ActualityService);
    const result = await service.expireOverdueListings();
    logger.log(`expireOverdueListings finished: ${JSON.stringify(result)}`);
    if (result.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during actuality expire command', err);
  process.exit(1);
});
