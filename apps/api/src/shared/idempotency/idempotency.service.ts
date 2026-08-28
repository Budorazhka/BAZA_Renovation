import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ClientSession, Types } from 'mongoose';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-codes';
import { IdempotencyRecordRepository } from './idempotency-record.repository';

export interface IdempotentReplay {
  responseStatus: number;
  responseBody: Record<string, unknown>;
}

/**
 * ADR-006 "Idempotency key для клиентских критических команд": publish/
 * book/cancel/manual-ledger. Единая точка для всех command handler'ов,
 * не оставляет паттерн "на память" разработчика (ADR-006 Consequences
 * явно предупреждает об этом риске) — тот же принцип, что runInTransaction
 * — единая точка транзакций.
 *
 * Использование в command handler'е (см. DevelopmentsService.publishDevelopment
 * для реального примера):
 *   1. ДО начала бизнес-транзакции: checkReplay(...) — если найден
 *      совпадающий (identityId, operation, key) с тем же requestHash,
 *      вернуть сохранённый responseStatus/responseBody клиенту НЕ
 *      выполняя операцию повторно; если requestHash не совпал — этот
 *      метод сам бросает IDEMPOTENCY_KEY_CONFLICT.
 *   2. ВНУТРИ той же MongoDB-транзакции, что бизнес-операция, ПОСЛЕ
 *      успешного выполнения: record(...) — записывает результат, session
 *      обязателен (ADR-006: "запись в той же транзакции").
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly repository: IdempotencyRecordRepository) {}

  /**
   * requestBody — детерминированная форма "содержимого запроса" для хеша,
   * НЕ обязательно буквальный HTTP body: для команд без тела (например,
   * publishDevelopment — только path-параметр) вызывающий код передаёт
   * {developmentId} или эквивалент, задача — обнаружить "тот же логический
   * запрос", не точное совпадение сериализованных байт.
   */
  async checkReplay(params: {
    identityId: Types.ObjectId;
    operation: string;
    key: string;
    requestBody: Record<string, unknown>;
  }): Promise<IdempotentReplay | null> {
    const existing = await this.repository.findByKey(params.identityId, params.operation, params.key);
    if (!existing) {
      return null;
    }

    const requestHash = hashRequestBody(params.requestBody);
    if (existing.requestHash !== requestHash) {
      // ADR-006: "клиент прислал тот же Idempotency-Key, но другое тело
      // запроса — запрос отклоняется с явной ошибкой конфликта (409), не
      // выполняется и не подменяет сохранённый response."
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was already used with a different request body',
      );
    }

    // ADR-006: "идемпотентность касается и неуспешных ответов, не только
    // успешных" — сохранённый responseStatus возвращается как есть, даже
    // если это была ошибка (сам факт replay не апгрейдит failed-попытку
    // в успешную и не заставляет клиент повторно её выполнять).
    return { responseStatus: existing.responseStatus, responseBody: existing.responseBody };
  }

  /**
   * MKT-002-IDEMP-RACE-001: закрывает реальную гонку между двумя ДЕЙСТВИТЕЛЬНО
   * одновременными запросами с одним Idempotency-Key. checkReplay() сам по
   * себе видит только уже ЗАКОММИЧЕННУЮ запись — единственный `record()`
   * читается снаружи транзакции (findByKey не принимает session), поэтому
   * технически способен увидеть запись соперника сразу после commit, но НЕ
   * раньше. Если оба запроса проходят earlyReplay почти синхронно (ключа
   * ещё нет), один выигрывает CAS на бизнес-сущности (markPublishing/
   * markPublishingForIdentity), другой сразу после проигрыша делает ОДИН
   * checkReplay() — и это гонка с фактическим временем commit транзакции
   * победителя, не гарантия. Воспроизведено интеграционным тестом:
   * единственный повторный checkReplay() после CAS-провала успевает не
   * всегда (см. mkt-002-listing-publication.integration-spec.ts, ERP-путь
   * без повторной проверки вообще, marketplace-путь с одной попыткой — оба
   * давали ложный 409 VERSION_CONFLICT вместо идемпотентного replay).
   *
   * awaitReplay() вызывается ТОЛЬКО из ветки "CAS-запись бизнес-сущности
   * провалилась" (modifiedCount:0), ПОСЛЕ выхода из своей собственной
   * транзакции (см. вызывающий код в PropertyAssetsService/
   * MarketplacePropertyAssetsService) — короткий bounded-retry с backoff,
   * не бесконечный polling: если запись соперника до сих пор не
   * закоммичена спустя разумное окно, это означает, что либо это
   * действительно ДРУГОЙ конкурентный запрос (другой ключ или его нет), либо
   * соперник упал/откатился до commit (crash-сценарий) — в обоих случаях
   * honest ConflictException вызывающей стороне лучше, чем зависание.
   */
  async awaitReplay(
    params: { identityId: Types.ObjectId; operation: string; key: string; requestBody: Record<string, unknown> },
    options: { attempts: number; delayMs: number } = { attempts: 8, delayMs: 25 },
  ): Promise<IdempotentReplay | null> {
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const replay = await this.checkReplay(params);
      if (replay) {
        return replay;
      }
      if (attempt < options.attempts - 1) {
        await sleep(options.delayMs);
      }
    }
    return null;
  }

  async record(
    params: {
      identityId: Types.ObjectId;
      operation: string;
      key: string;
      requestBody: Record<string, unknown>;
      responseStatus: number;
      responseBody: Record<string, unknown>;
    },
    session: ClientSession,
  ): Promise<void> {
    await this.repository.create(
      {
        identityId: params.identityId,
        operation: params.operation,
        key: params.key,
        requestHash: hashRequestBody(params.requestBody),
        responseStatus: params.responseStatus,
        responseBody: params.responseBody,
      },
      session,
    );
  }
}

function hashRequestBody(requestBody: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
