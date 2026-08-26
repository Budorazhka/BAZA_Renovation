import type { OutboxEventDocument } from '@baza/domain-events';

/**
 * Контракт side-effect обработчика одного eventType. ADR-006 идемпотентность:
 * handler ДОЛЖЕН быть безопасен для повторного вызова с одним и тем же
 * event (replay намеренный или из-за retry после сбоя между markDone и
 * коммитом — крайне маловероятное, но не исключённое окно) — через
 * естественную идемпотентность самой операции (upsert по стабильному ключу)
 * или явную проверку processed_keys внутри конкретного handler'а, если
 * операция не идемпотентна сама по себе. OutboxPollerService не
 * гарантирует ровно-один-раз доставку, только at-least-once (ADR-006).
 */
export interface EventHandler {
  handle(event: OutboxEventDocument): Promise<void>;
}
