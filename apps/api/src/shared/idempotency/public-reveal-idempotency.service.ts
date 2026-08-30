import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import { PublicRevealIdempotencyRecordRepository } from './public-reveal-idempotency-record.repository';

export interface PublicRevealIdempotentReplay {
  responseStatus: number;
  responseBody: Record<string, unknown>;
}

/**
 * Гостевой вариант IdempotencyService (см. idempotency.service.ts докстринг) —
 * тот же checkReplay-до/record-внутри-транзакции паттерн ADR-006, но БЕЗ
 * identityId (reveal-contact вызывается анонимными гостями без сессии).
 * Ключ — (publicationSlug, idempotencyKey). Заголовок Idempotency-Key на
 * reveal-contact ОПЦИОНАЛЕН (в отличие от publish/book/cancel) — контроллер
 * вызывает этот сервис только когда заголовок присутствует; без заголовка
 * поведение не меняется (всегда новый Lead), полная обратная совместимость.
 */
@Injectable()
export class PublicRevealIdempotencyService {
  constructor(private readonly repository: PublicRevealIdempotencyRecordRepository) {}

  async checkReplay(params: {
    publicationSlug: string;
    idempotencyKey: string;
    requestBody: Record<string, unknown>;
  }): Promise<PublicRevealIdempotentReplay | null> {
    const existing = await this.repository.findByKey(params.publicationSlug, params.idempotencyKey);
    if (!existing) {
      return null;
    }

    const requestHash = hashRequestBody(params.requestBody);
    if (existing.requestHash !== requestHash) {
      // Тот же принцип, что ADR-006: тот же Idempotency-Key, другое тело
      // запроса — явный конфликт (409), не тихая подмена сохранённого ответа.
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was already used with a different request body',
      );
    }

    return { responseStatus: existing.responseStatus, responseBody: existing.responseBody };
  }

  /**
   * Вызывается ВНУТРИ той же транзакции, что Contact/Lead/LeadEvent/audit
   * создание (последним шагом, после успешного revealContact/revealListingContact) —
   * тот же принцип, что IdempotencyService.record. Race: если два
   * параллельных запроса с одним (slug, key) оба доходят до записи
   * одновременно, проигравший получает duplicate key error (unique index на
   * схеме) — это ЗАКРЫВАЕТ его собственную транзакцию целиком (withTransaction
   * откатывает Lead/LeadEvent/audit, которые он успел создать в той же
   * транзакции, до commit), поэтому проигравший НЕ создаёт "лишний" Lead.
   * Вызывающий код (CrmService) обязан поймать эту ошибку СНАРУЖИ
   * runInTransaction (после отката) и сделать повторный checkReplay() —
   * тот же "close the race" принцип, что checkOwnReplay в
   * DevelopmentsService.publishDevelopment, адаптированный к тому, что здесь
   * запись читается уже ПОСЛЕ отката своей транзакции, не изнутри неё.
   */
  async record(
    params: {
      publicationSlug: string;
      idempotencyKey: string;
      requestBody: Record<string, unknown>;
      responseStatus: number;
      responseBody: Record<string, unknown>;
      leadId: Types.ObjectId;
    },
    session: ClientSession,
  ): Promise<void> {
    await this.repository.create(
      {
        publicationSlug: params.publicationSlug,
        idempotencyKey: params.idempotencyKey,
        requestHash: hashRequestBody(params.requestBody),
        responseStatus: params.responseStatus,
        responseBody: params.responseBody,
        leadId: params.leadId,
      },
      session,
    );
  }
}

function hashRequestBody(requestBody: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
}
