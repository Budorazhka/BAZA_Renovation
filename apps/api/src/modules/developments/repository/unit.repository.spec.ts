import { Types } from 'mongoose';
import { UnitRepository } from './unit.repository';

describe('UnitRepository', () => {
  describe('updatePriceWithVersionCheck', () => {
    /**
     * Критичная проверка: price И priceHistory-append должны быть в ОДНОМ
     * updateOne-вызове (не двух отдельных запросах) — иначе окно между
     * "цена уже новая" и "history ещё не записана" при сбое между ними.
     */
    it('обновляет price И пушит priceHistory-запись атомарно в одном updateOne', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const changedBy = new Types.ObjectId();
      const fakeSession = {} as never;
      const price = { amountMinorUnits: 15_000_000, currency: 'USD' as const };

      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new UnitRepository(mockModel as never);
      await repository.updatePriceWithVersionCheck(id, organizationId, 2, { price, changedBy }, fakeSession);

      expect(updateOneSpy).toHaveBeenCalledTimes(1);
      const [filter, update] = updateOneSpy.mock.calls[0] as [
        unknown,
        { $set: { price: unknown }; $push: { priceHistory: { price: unknown; changedBy: unknown } }; $inc: { version: number } },
      ];

      expect(filter).toEqual({ _id: id, organizationId, version: 2 });
      expect(update.$set.price).toEqual(price);
      expect(update.$push.priceHistory.price).toEqual(price);
      expect(update.$push.priceHistory.changedBy).toEqual(changedBy);
      expect(update.$inc.version).toBe(1);
    });

    it('возвращает modifiedCount:0 при version conflict', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new UnitRepository(mockModel as never);
      const result = await repository.updatePriceWithVersionCheck(
        new Types.ObjectId(),
        new Types.ObjectId(),
        5,
        { price: { amountMinorUnits: 1, currency: 'USD' }, changedBy: new Types.ObjectId() },
        {} as never,
      );

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('updateStatusWithVersionCheck', () => {
    it('фильтр включает organizationId, expectedVersion И допустимые исходные статусы', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new UnitRepository(mockModel as never);
      await repository.updateStatusWithVersionCheck(id, organizationId, 0, 'reserved', ['available']);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 0, status: { $in: ['available'] } },
        { $set: { status: 'reserved' }, $inc: { version: 1 } },
        { session: undefined },
      );
    });
  });

  describe('create', () => {
    it('инициализирует status:available, priceHistory:[], version:0', async () => {
      const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
      const mockModel = { create: createSpy };

      const repository = new UnitRepository(mockModel as never);
      await repository.create({
        buildingId: new Types.ObjectId(),
        floorId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        number: '101',
        kind: 'apartment',
        area: 45,
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
      });

      expect(createSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ status: 'available', priceHistory: [], version: 0 })],
        { session: undefined },
      );
    });
  });

  describe('listForBuilding', () => {
    /**
     * Регрессия на IDOR: старая сигнатура listForBuilding(buildingId, filter)
     * не принимала organizationId вообще — units чужой организации с
     * подходящим buildingId были бы возвращены. organizationId теперь часть
     * самого Mongo-фильтра, не post-fetch проверка.
     */
    it('фильтр включает organizationId, buildingId и опциональные kind/status', async () => {
      const buildingId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new UnitRepository(mockModel as never);
      await repository.listForBuilding(buildingId, organizationId, { kind: 'apartment', status: 'available', limit: 100 });

      expect(findSpy).toHaveBeenCalledWith({ buildingId, organizationId, kind: 'apartment', status: 'available' });
      expect(sortSpy).toHaveBeenCalledWith({ _id: 1 });
      expect(limitSpy).toHaveBeenCalledWith(100);
    });

    it('без kind/status фильтрует только по buildingId+organizationId', async () => {
      const buildingId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new UnitRepository(mockModel as never);
      await repository.listForBuilding(buildingId, organizationId, { limit: 50 });

      expect(findSpy).toHaveBeenCalledWith({ buildingId, organizationId });
      expect(limitSpy).toHaveBeenCalledWith(50);
    });
  });
});
