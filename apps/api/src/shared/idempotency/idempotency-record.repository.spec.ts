import { Types } from 'mongoose';
import { IdempotencyRecordRepository } from './idempotency-record.repository';

describe('IdempotencyRecordRepository.findByKey', () => {
  it('ищет по составному {identityId, operation, key}', async () => {
    const identityId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue(null);
    const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new IdempotencyRecordRepository({ findOne: findOneSpy } as never);

    await repository.findByKey(identityId, 'publishDevelopment', 'some-key');

    expect(findOneSpy).toHaveBeenCalledWith({ identityId, operation: 'publishDevelopment', key: 'some-key' });
  });
});

describe('IdempotencyRecordRepository.create', () => {
  it('передаёт session — запись должна быть частью бизнес-транзакции (ADR-006)', async () => {
    const identityId = new Types.ObjectId();
    const fakeSession = {} as never;
    const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
    const repository = new IdempotencyRecordRepository({ create: createSpy } as never);

    const params = {
      identityId,
      operation: 'publishDevelopment',
      key: 'some-key',
      requestHash: 'hash',
      responseStatus: 202,
      responseBody: { status: 'ok' },
    };
    await repository.create(params, fakeSession);

    expect(createSpy).toHaveBeenCalledWith([params], { session: fakeSession });
  });
});
