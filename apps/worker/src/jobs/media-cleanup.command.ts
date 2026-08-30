import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MediaCleanupModule } from './media-cleanup.module';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * Standalone command, НЕ @Cron/scheduler в процессе — нет ни одной
 * scheduling-зависимости в репозитории (@nestjs/schedule, nest-commander,
 * ни единого @Cron нигде — grep подтверждает), заводить новую только ради
 * одной cleanup-задачи означало бы новый паттерн, ломающий "explicit wiring,
 * no framework magic" стиль этого кодбейза (тот же принцип, что уже описан
 * в главном ADR-001 про два процесса api/worker — здесь третий, ops-invoked,
 * не постоянно работающий процесс). Внешний cron (ops, вне кодовой базы)
 * вызывает `pnpm --filter worker run cleanup:orphaned-media` по расписанию —
 * тот же подход, что стандартные Unix cron-jobs для batch-обслуживания,
 * никакого нового runtime-компонента приложение не приобретает.
 *
 * Флаги: `--dry-run` (или MEDIA_CLEANUP_DRY_RUN=true) — находит и логирует
 * кандидатов, ничего не claim'ит/не удаляет.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGO_URI'),
      }),
    }),
    MediaCleanupModule,
  ],
})
class MediaCleanupCommandModule {}

async function bootstrap(): Promise<void> {
  const logger = new Logger('MediaCleanupCommand');
  const dryRun = process.argv.includes('--dry-run') || process.env.MEDIA_CLEANUP_DRY_RUN === 'true';

  const app = await NestFactory.createApplicationContext(MediaCleanupCommandModule);
  try {
    const service = app.get(MediaCleanupService);
    const result = await service.run({ dryRun });
    logger.log(`Cleanup finished: ${JSON.stringify(result)}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during media cleanup command', err);
  process.exit(1);
});
