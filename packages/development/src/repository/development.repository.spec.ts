import { Types } from 'mongoose';
import { DevelopmentRepository } from './development.repository';

describe('DevelopmentRepository', () => {
  describe('findByIdForOrganization', () => {
    it('фильтрует по _id И organizationId одновременно (не отдельная post-fetch проверка)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const findOneSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const mockModel = { findOne: findOneSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId });
    });
  });

  describe('findById', () => {
    it('worker-side lookup БЕЗ tenant-фильтра (по _id только)', async () => {
      const id = new Types.ObjectId();
      const findByIdSpy = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const mockModel = { findById: findByIdSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.findById(id);

      expect(findByIdSpy).toHaveBeenCalledWith(id);
    });
  });

  describe('updateWithVersionCheck', () => {
    it('условие фильтра включает expectedVersion (optimistic concurrency)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.updateWithVersionCheck(id, organizationId, 3, { name: 'New name' });

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 3 },
        { $set: { name: 'New name' }, $inc: { version: 1 } },
        { session: undefined },
      );
    });

    it('возвращает modifiedCount:0 при несовпадении version', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new DevelopmentRepository(mockModel as never);
      const result = await repository.updateWithVersionCheck(
        new Types.ObjectId(),
        new Types.ObjectId(),
        5,
        {},
      );

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('updateStatus', () => {
    /**
     * Найдено реальным integration-тестом (два параллельных HTTP publish с
     * одним Idempotency-Key): фильтр раньше был {_id, organizationId} БЕЗ
     * условия на текущий status — не настоящий compare-and-swap. Обе
     * конкурентные транзакции проходили updateOne, обе получали
     * modifiedCount:1, обе пытались записать idempotency record — второй
     * insert падал duplicate key error. status:fromStatus в фильтре делает
     * его реальным атомарным CAS.
     */
    it('условие фильтра включает fromStatus (compare-and-swap, не просто {_id, organizationId})', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.updateStatus(id, organizationId, 'draft', 'active');

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, status: 'draft' },
        { $set: { status: 'active' }, $inc: { version: 1 } },
        { session: undefined },
      );
    });

    it('возвращает modifiedCount:0, если текущий status не совпадает с fromStatus (конкурент уже сменил статус)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new DevelopmentRepository(mockModel as never);
      const result = await repository.updateStatus(
        new Types.ObjectId(),
        new Types.ObjectId(),
        'draft',
        'active',
      );

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('listForOrganization', () => {
    it('без cursor фильтрует только по organizationId', async () => {
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.listForOrganization(organizationId, { limit: 20 });

      expect(findSpy).toHaveBeenCalledWith({ organizationId });
      expect(limitSpy).toHaveBeenCalledWith(20);
    });

    it('с cursor добавляет условие _id > cursor', async () => {
      const organizationId = new Types.ObjectId();
      const cursor = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new DevelopmentRepository(mockModel as never);
      await repository.listForOrganization(organizationId, { cursor, limit: 20 });

      expect(findSpy).toHaveBeenCalledWith({ organizationId, _id: { $gt: cursor } });
    });
  });
});
