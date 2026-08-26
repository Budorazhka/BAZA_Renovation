import { Types } from 'mongoose';
import { IdempotencyService } from './idempotency.service';
import { ErrorCode } from '../errors/error-codes';
import type { IdempotencyRecordRepository } from './idempotency-record.repository';

describe('IdempotencyService.checkReplay', () => {
  it('нет существующей записи — возвращает null, не бросает', async () => {
    const service = new IdempotencyService(
      { findByKey: jest.fn().mockResolvedValue(null) } as unknown as IdempotencyRecordRepository,
    );

    const result = await service.checkReplay({
      identityId: new Types.ObjectId(),
      operation: 'publishDevelopment',
      key: 'some-key',
      requestBody: { developmentId: 'x' },
    });

    expect(result).toBeNull();
  });

  it('существующая запись с совпадающим requestHash — возвращает сохранённый ответ, не бросает', async () => {
    const requestBody = { developmentId: 'dev-1' };
    // Тот же алгоритм хеша, что внутри сервиса — sha256(JSON.stringify(requestBody)).
    const { createHash } = await import('node:crypto');
    const matchingHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');

    const service = new IdempotencyService(
      {
        findByKey: jest.fn().mockResolvedValue({
          requestHash: matchingHash,
          responseStatus: 202,
          responseBody: { status: 'publication_pending' },
        }),
      } as unknown as IdempotencyRecordRepository,
    );

    const result = await service.checkReplay({
      identityId: new Types.ObjectId(),
      operation: 'publishDevelopment',
      key: 'some-key',
      requestBody,
    });

    expect(result).toEqual({ responseStatus: 202, responseBody: { status: 'publication_pending' } });
  });

  /**
   * ADR-006: "клиент прислал тот же Idempotency-Key, но другое тело
   * запроса — запрос отклоняется с явной ошибкой конфликта (409)".
   */
  it('существующая запись с НЕсовпадающим requestHash — бросает IDEMPOTENCY_KEY_CONFLICT', async () => {
    const service = new IdempotencyService(
      {
        findByKey: jest.fn().mockResolvedValue({
          requestHash: 'completely-different-hash',
          responseStatus: 202,
          responseBody: {},
        }),
      } as unknown as IdempotencyRecordRepository,
    );

    await expect(
      service.checkReplay({
        identityId: new Types.ObjectId(),
        operation: 'publishDevelopment',
        key: 'some-key',
        requestBody: { developmentId: 'dev-2' },
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT }));
  });

  /**
   * ADR-006: "идемпотентность касается и неуспешных ответов, не только
   * успешных" — сохранённый responseStatus возвращается как есть.
   */
  it('replay сохранённого НЕуспешного ответа возвращает его as-is, не апгрейдит в успех', async () => {
    const requestBody = { developmentId: 'dev-3' };
    const { createHash } = await import('node:crypto');
    const matchingHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');

    const service = new IdempotencyService(
      {
        findByKey: jest.fn().mockResolvedValue({
          requestHash: matchingHash,
          responseStatus: 409,
          responseBody: { error: { code: 'VERSION_CONFLICT' } },
        }),
      } as unknown as IdempotencyRecordRepository,
    );

    const result = await service.checkReplay({
      identityId: new Types.ObjectId(),
      operation: 'publishDevelopment',
      key: 'some-key',
      requestBody,
    });

    expect(result?.responseStatus).toBe(409);
  });
});

describe('IdempotencyService.record', () => {
  it('вычисляет requestHash и передаёт всё в repository.create вместе с session', async () => {
    const identityId = new Types.ObjectId();
    const fakeSession = {} as never;
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const service = new IdempotencyService({ create: createSpy } as unknown as IdempotencyRecordRepository);

    const requestBody = { developmentId: 'dev-1' };
    await service.record(
      {
        identityId,
        operation: 'publishDevelopment',
        key: 'some-key',
        requestBody,
        responseStatus: 202,
        responseBody: { status: 'publication_pending' },
      },
      fakeSession,
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [params, session] = createSpy.mock.calls[0] as [
      { identityId: typeof identityId; operation: string; key: string; requestHash: string },
      unknown,
    ];
    expect(params.identityId).toBe(identityId);
    expect(params.operation).toBe('publishDevelopment');
    expect(params.key).toBe('some-key');
    expect(params.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session).toBe(fakeSession);
  });
});
