import 'reflect-metadata';
// Side-effect-only импорты, та же причина, что в actuality-expire.command.ts:
// ambient-типы плагинов Fastify (setCookie из @fastify/cookie,
// isMultipart/file из @fastify/multipart) регистрирует только main.api.ts, а
// ts-node типизирует граф этого entrypoint'а отдельно.
import '@fastify/cookie';
import '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { BookingsService } from '../modules/bookings/bookings.service';

/**
 * Истечение броней по сроку — точка входа вне HTTP. Тот же паттерн, что
 * actuality-expire.command.ts (см. его докстринг): в кодовой базе нет
 * scheduling-зависимостей, команда делает операцию вызываемой, а решение
 * «когда вызывать» живёт в инфраструктуре — сервис `booking-expire` в
 * compose-профиле `scheduled` или обычный cron рядом с приложением.
 *
 * Полный AppModule, а не ручной набор providers: BookingsService тянет
 * DevelopmentsService, CrmService, outbox, audit и идемпотентность —
 * повторять этот граф вручную значит рисковать пропустить зависимость.
 * createApplicationContext HTTP-порт не слушает.
 *
 * Код выхода 1 при `errors > 0`: повод для строки в логе, расписание при этом
 * продолжается (`|| echo` в compose), иначе одна битая бронь выключила бы
 * истечение для всех остальных.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BookingExpireCommand');

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const service = app.get(BookingsService);
    const result = await service.expireOverdueBookings();
    logger.log(`expireOverdueBookings finished: ${JSON.stringify(result)}`);
    if (result.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during booking expire command', err);
  process.exit(1);
});
