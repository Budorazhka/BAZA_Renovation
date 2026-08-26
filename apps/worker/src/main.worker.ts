import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { OutboxPollerService } from './outbox/outbox-poller.service';

/**
 * ADR-001: worker-процесс — второй из двух entrypoint'ов одного кодового
 * артефакта (первый — main.api.ts в apps/api). Без HTTP-сервера —
 * createApplicationContext, не create() (нет платформы-адаптера, worker
 * не принимает входящих запросов, только опрашивает MongoDB outbox).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.createApplicationContext(AppModule);

  const poller = app.get(OutboxPollerService);
  poller.start();
  logger.log('Worker started, outbox polling active');

  // Graceful shutdown: даём текущему batch'у обработки завершиться перед
  // остановкой процесса (SIGTERM — стандартный сигнал docker-compose stop).
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Received ${signal}, stopping poller and closing application context`);
    poller.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Fatal error during worker bootstrap', err);
  process.exit(1);
});
