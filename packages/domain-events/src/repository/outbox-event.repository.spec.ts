import { Types } from 'mongoose';
import { OutboxEventRepository } from './outbox-event.repository';

/**
 * markFailedAttempt/markProcessing переписаны на атомарные MongoDB-операции
 * ($inc / условный updateOne) вместо read-then-write — эти тесты проверяют
 * решение о следующем статусе (pending vs dead_letter) на основе значения,
 * возвращённого САМИМ MongoDB после инкремента ($inc + findOneAndUpdate),
 * не значения, прочитанного отдельным запросом до записи.
 */
describe('OutboxEventRepository', () => {
  describe('markFailedAttempt', () => {
    it('оставляет status=pending с рассчитанным nextRetryAt (exponential backoff), если attempts ещё меньше maxAttempts', async () => {
      const id = new Types.ObjectId();
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ attempts: 2 }),
      });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy, updateOne: updateOneSpy };

      const before = Date.now();
      const repository = new OutboxEventRepository(mockModel as never);
      await repository.markFailedAttempt(id, 5);
      const after = Date.now();

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      expect(updateOneSpy).toHaveBeenCalledTimes(1);
      const [filter, update] = updateOneSpy.mock.calls[0] as [unknown, { $set: { status: string; nextRetryAt: Date } }];
      expect(filter).toEqual({ _id: id });
      expect(update.$set.status).toBe('pending');
      // attempts:2 → backoffSeconds = min(2^2, 300) = 4с.
      const expectedMin = before + 4000;
      const expectedMax = after + 4000;
      expect(update.$set.nextRetryAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(update.$set.nextRetryAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('капает backoff на 300 секунд при большом числе попыток (не растягивает retry на часы)', async () => {
      const id = new Types.ObjectId();
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ attempts: 20 }), // 2^20 секунд без капа — недели
      });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy, updateOne: updateOneSpy };

      const before = Date.now();
      const repository = new OutboxEventRepository(mockModel as never);
      await repository.markFailedAttempt(id, 50);
      const after = Date.now();

      const [, update] = updateOneSpy.mock.calls[0] as [unknown, { $set: { nextRetryAt: Date } }];
      expect(update.$set.nextRetryAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
      expect(update.$set.nextRetryAt.getTime()).toBeLessThanOrEqual(after + 300_000);
    });

    it('переводит в dead_letter, если attempts после инкремента достиг maxAttempts', async () => {
      const id = new Types.ObjectId();
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ attempts: 5 }),
      });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy, updateOne: updateOneSpy };

      const repository = new OutboxEventRepository(mockModel as never);
      await repository.markFailedAttempt(id, 5);

      expect(updateOneSpy).toHaveBeenCalledWith({ _id: id }, { $set: { status: 'dead_letter' } });
    });

    it('не вызывает updateOne, если документ не найден (findOneAndUpdate вернул null)', async () => {
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const updateOneSpy = jest.fn();
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy, updateOne: updateOneSpy };

      const repository = new OutboxEventRepository(mockModel as never);
      await repository.markFailedAttempt(new Types.ObjectId(), 5);

      expect(updateOneSpy).not.toHaveBeenCalled();
    });
  });

  describe('findPendingBatch', () => {
    it('фильтрует по status:pending и nextRetryAt не в будущем', async () => {
      const findSpy = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      const mockModel = { find: findSpy };

      const repository = new OutboxEventRepository(mockModel as never);
      await repository.findPendingBatch(20);

      expect(findSpy).toHaveBeenCalledWith({
        status: 'pending',
        nextRetryAt: { $not: { $gt: expect.any(Date) } },
      });
    });
  });

  describe('markProcessing', () => {
    it('возвращает claimed:true, если updateOne реально изменил документ (modifiedCount:1)', async () => {
      const updateOneSpy = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new OutboxEventRepository(mockModel as never);
      const result = await repository.markProcessing(new Types.ObjectId());

      expect(result).toEqual({ claimed: true });
    });

    it('возвращает claimed:false, если событие уже забрано другим worker-инстансом (modifiedCount:0)', async () => {
      const updateOneSpy = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new OutboxEventRepository(mockModel as never);
      const result = await repository.markProcessing(new Types.ObjectId());

      expect(result).toEqual({ claimed: false });
    });
  });
});
