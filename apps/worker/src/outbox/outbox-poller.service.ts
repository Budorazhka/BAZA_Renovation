import { Injectable, Logger } from '@nestjs/common';
import { OutboxEventRepository, type OutboxEventDocument } from '@baza/domain-events';
import { EventHandlerRegistry } from './event-handler.registry';

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

/**
 * ADR-006: worker вычитывает outbox через polling (уточнение ADR-001,
 * см. docs/architecture/adr/001-modular-monolith.md — change streams
 * оставлены как будущая опция, не выбраны на первом проходе). Короткий
 * интервал (2с) — баланс между задержкой доставки событий и нагрузкой на
 * MongoDB на MVP-масштабе (≤40 пользователей, редкие события).
 */
@Injectable()
export class OutboxPollerService {
  private readonly logger = new Logger(OutboxPollerService.name);
  private timer: NodeJS.Timeout | undefined;
  private isPolling = false;

  constructor(
    private readonly outboxEventRepository: OutboxEventRepository,
    private readonly handlerRegistry: EventHandlerRegistry,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * isPolling guard — предотвращает наложение двух пересекающихся
   * pollOnce() вызовов внутри ОДНОГО процесса, если обработка batch'а
   * заняла дольше POLL_INTERVAL_MS (setInterval не ждёт завершения
   * предыдущего callback'а сам по себе). Не защищает от нескольких
   * ОТДЕЛЬНЫХ worker-процессов — это уже задача markProcessing() (атомарный
   * conditional update на стороне MongoDB, см. OutboxEventRepository).
   */
  private async pollOnce(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const batch = await this.outboxEventRepository.findPendingBatch(BATCH_SIZE);
      for (const event of batch) {
        await this.processOne(event);
      }
    } catch (err) {
      this.logger.error('Ошибка при опросе outbox — цикл продолжится на следующем интервале', err);
    } finally {
      this.isPolling = false;
    }
  }

  private async processOne(event: OutboxEventDocument): Promise<void> {
    const { claimed } = await this.outboxEventRepository.markProcessing(event._id);
    if (!claimed) {
      // Другой worker-инстанс (или предыдущий цикл этого же процесса,
      // если batch пересёкся) уже забрал это событие между findPendingBatch
      // и этим вызовом — не ошибка, просто пропускаем.
      return;
    }

    const handler = this.handlerRegistry.resolve(event.eventType);
    if (!handler) {
      // Нет handler'а — не бесконечно "processing", даём событию дойти до
      // dead_letter тем же путём, что реальная ошибка обработки, чтобы оно
      // не зависло молча в processing навсегда.
      await this.outboxEventRepository.markFailedAttempt(event._id, MAX_ATTEMPTS);
      return;
    }

    try {
      await handler.handle(event);
      await this.outboxEventRepository.markDone(event._id);
    } catch (err) {
      this.logger.error(
        `Обработка события ${event.eventType} (${event._id.toString()}) провалилась, attempt ${event.attempts + 1}/${MAX_ATTEMPTS}`,
        err,
      );
      await this.outboxEventRepository.markFailedAttempt(event._id, MAX_ATTEMPTS);
    }
  }
}
