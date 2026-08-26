import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { OutboxEventDocument } from '../schemas/outbox-event.schema';

/**
 * Единственная точка доступа к коллекции outbox_events (ADR-002 требование 2
 * применён и здесь, хотя формально не tenant-scoped — тот же принцип "одна
 * точка доступа к коллекции, не разбросанные Model-вызовы"). Используется и
 * API-процессом (create внутри транзакции), и worker-процессом (остальные
 * методы) — единственный код, знающий об этой коллекции для обеих сторон.
 */
@Injectable()
export class OutboxEventRepository {
  constructor(
    @InjectModel(OutboxEventDocument.name) private readonly model: Model<OutboxEventDocument>,
  ) {}

  /**
   * ADR-006: обязателен session — вызывающий код гарантирует, что это
   * создание происходит внутри той же транзакции, что бизнес-изменение.
   * Требование session (не optional) здесь намеренно строже, чем в других
   * repository этого проекта — outbox event ВНЕ транзакции архитектурно
   * бессмысленен (весь смысл паттерна в атомарности с бизнес-изменением).
   */
  async create(
    params: {
      eventType: string;
      payload: Record<string, unknown>;
      aggregateId: Types.ObjectId;
      aggregateType: string;
      deduplicationKey: string;
    },
    session: ClientSession,
  ): Promise<void> {
    await this.model.create([{ ...params, status: 'pending', attempts: 0 }], { session });
  }

  /**
   * `nextRetryAt: {$not: {$gt: now}}` — забирает и события без nextRetryAt
   * (первая попытка, поле ещё не установлено), и события, чей backoff-
   * период уже истёк; НЕ забирает события, всё ещё ожидающие exponential
   * backoff после failed attempt (markFailedAttempt ниже).
   */
  async findPendingBatch(limit: number): Promise<OutboxEventDocument[]> {
    return this.model
      .find({ status: 'pending', nextRetryAt: { $not: { $gt: new Date() } } })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  /**
   * Атомарный переход pending→processing через условие в фильтре (не
   * простой updateOne({_id}) — если несколько worker-инстансов когда-либо
   * будут запущены параллельно (ADR-001 явно допускает это как причину
   * разделения API/worker на отдельные процессы), два инстанса не должны
   * оба забрать одно и то же pending-событие. modifiedCount:0 означает
   * "кто-то другой уже забрал это событие" — caller должен пропустить его,
   * не считать ошибкой.
   */
  async markProcessing(id: Types.ObjectId): Promise<{ claimed: boolean }> {
    const result = await this.model
      .updateOne({ _id: id, status: 'pending' }, { $set: { status: 'processing' } })
      .exec();
    return { claimed: result.modifiedCount === 1 };
  }

  async markDone(id: Types.ObjectId): Promise<void> {
    await this.model
      .updateOne({ _id: id }, { $set: { status: 'done', processedAt: new Date() } })
      .exec();
  }

  /**
   * Атомарный $inc вместо read-then-write (findById + отдельный updateOne)
   * — предыдущая реализация теряла инкременты под конкурентной обработкой
   * (два параллельных failed-attempt на одно событие могли оба прочитать
   * attempts:2 и оба записать attempts:3, потеряв один инкремент). findOneAndUpdate
   * с $inc атомарен на уровне документа, статус после инкремента решается
   * по уже актуальному (постинкрементному) значению из ответа MongoDB, не
   * по значению, прочитанному до инкремента отдельным запросом.
   *
   * ADR-006 "применяет exponential backoff": nextRetryAt устанавливается
   * как now + 2^attempts секунд (капается на 5 минут, чтобы не откладывать
   * ретрай на часы при накоплении попыток) — не переустанавливается при
   * переходе в dead_letter (там уже неважно).
   */
  async markFailedAttempt(id: Types.ObjectId, maxAttempts: number): Promise<void> {
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id },
        { $inc: { attempts: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) return;

    if (updated.attempts >= maxAttempts) {
      await this.model.updateOne({ _id: id }, { $set: { status: 'dead_letter' } }).exec();
      return;
    }

    const backoffSeconds = Math.min(2 ** updated.attempts, 300);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    await this.model.updateOne({ _id: id }, { $set: { status: 'pending', nextRetryAt } }).exec();
  }
}
