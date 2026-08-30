import { Types } from 'mongoose';
import { PublicRevealIdempotencyService } from './public-reveal-idempotency.service';
import { ErrorCode } from '../errors/error-codes';
import type { PublicRevealIdempotencyRecordRepository } from './public-reveal-idempotency-record.repository';

describe('PublicRevealIdempotencyService.checkReplay', () => {
  it('нет существующей записи — возвращает null, не бросает', async () => {
    const service = new PublicRevealIdempotencyService(
      { findByKey: jest.fn().mockResolvedValue(null) } as unknown as PublicRevealIdempotencyRecordRepository,
    );

    const result = await service.checkReplay({
      publicationSlug: 'batumi-flat-85k',
      idempotencyKey: 'some-key',
      requestBody: { requesterPhone: '+995555000000' },
    });

    expect(result).toBeNull();
  });

  it('существующая запись с совпадающим requestHash — возвращает сохранённый ответ, не бросает', async () => {
    const requestBody = { requesterPhone: '+995555000000' };
    const { createHash } = await import('node:crypto');
    const matchingHash = createHash('sha256').update(JSON.stringify(requestBody)).digest('hex');

    const service = new PublicRevealIdempotencyService(
      {
        findByKey: jest.fn().mockResolvedValue({
          requestHash: matchingHash,
          responseStatus: 200,
          responseBody: { phone: '+995555999999', leadId: 'lead-1' },
        }),
      } as unknown as PublicRevealIdempotencyRecordRepository,
    );

    const result = await service.checkReplay({
      publicationSlug: 'batumi-flat-85k',
      idempotencyKey: 'some-key',
      requestBody,
    });

    expect(result).toEqual({ responseStatus: 200, responseBody: { phone: '+995555999999', leadId: 'lead-1' } });
  });

  it('существующая запись с НЕсовпадающим requestHash — бросает IDEMPOTENCY_KEY_CONFLICT', async () => {
    const service = new PublicRevealIdempotencyService(
      {
        findByKey: jest.fn().mockResolvedValue({
          requestHash: 'completely-different-hash',
          responseStatus: 200,
          responseBody: {},
        }),
      } as unknown as PublicRevealIdempotencyRecordRepository,
    );

    await expect(
      service.checkReplay({
        publicationSlug: 'batumi-flat-85k',
        idempotencyKey: 'some-key',
        requestBody: { requesterPhone: '+995555111111' },
      }),
    ).rejects.toMatchObject(expect.objectContaining({ code: ErrorCode.IDEMPOTENCY_KEY_CONFLICT }));
  });
});

describe('PublicRevealIdempotencyService.record', () => {
  it('вычисляет requestHash и передаёт всё в repository.create вместе с session', async () => {
    const leadId = new Types.ObjectId();
    const fakeSession = {} as never;
    const createSpy = jest.fn().mockResolvedValue(undefined);
    const service = new PublicRevealIdempotencyService({
      create: createSpy,
    } as unknown as PublicRevealIdempotencyRecordRepository);

    const requestBody = { requesterPhone: '+995555000000' };
    await service.record(
      {
        publicationSlug: 'batumi-flat-85k',
        idempotencyKey: 'some-key',
        requestBody,
        responseStatus: 200,
        responseBody: { phone: '+995555999999', leadId: leadId.toString() },
        leadId,
      },
      fakeSession,
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [params, session] = createSpy.mock.calls[0] as [
      { publicationSlug: string; idempotencyKey: string; requestHash: string; leadId: Types.ObjectId },
      unknown,
    ];
    expect(params.publicationSlug).toBe('batumi-flat-85k');
    expect(params.idempotencyKey).toBe('some-key');
    expect(params.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(params.leadId).toBe(leadId);
    expect(session).toBe(fakeSession);
  });
});
