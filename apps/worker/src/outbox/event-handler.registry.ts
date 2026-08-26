import { Injectable, Logger } from '@nestjs/common';
import type { EventHandler } from './event-handler';

/**
 * Карта eventType → handler. Новый handler регистрируется декларативно
 * через register() при старте модуля (см. worker.module.ts), не требует
 * правки центрального switch-case здесь — держит диспетчеризацию открытой
 * для расширения новыми eventType без изменения этого файла.
 */
@Injectable()
export class EventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerRegistry.name);
  private readonly handlers = new Map<string, EventHandler>();

  register(eventType: string, handler: EventHandler): void {
    if (this.handlers.has(eventType)) {
      throw new Error(
        `EventHandlerRegistry: eventType "${eventType}" уже зарегистрирован — двойная регистрация обычно программная ошибка (два handler'а на одно событие), не переопределяем молча.`,
      );
    }
    this.handlers.set(eventType, handler);
  }

  resolve(eventType: string): EventHandler | undefined {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      this.logger.warn(
        `Нет зарегистрированного handler'а для eventType "${eventType}" — событие переведётся в dead_letter после исчерпания попыток без обработки. Проверьте, что все производимые outbox-события имеют соответствующий handler.`,
      );
    }
    return handler;
  }
}
