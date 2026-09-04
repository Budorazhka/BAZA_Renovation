import { Types } from 'mongoose';
import { DevSelectionRepository } from './dev-selection.repository';

describe('DevSelectionRepository', () => {
  describe('create', () => {
    it('создаёт подборку со статусом draft, version 0 и items из unitIds', async () => {
      const mockDoc = { id: 'sel-1' };
      const createSpy = jest.fn().mockResolvedValue([mockDoc]);
      const mockModel = { create: createSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const unitIds = [new Types.ObjectId(), new Types.ObjectId()];
      const params = {
        organizationId: new Types.ObjectId(),
        createdByPositionId: new Types.ObjectId(),
        publicToken: 'a'.repeat(64),
        title: 'Подборка для Анны',
        unitIds,
      };

      const result = await repository.create(params);

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            organizationId: params.organizationId,
            createdByPositionId: params.createdByPositionId,
            publicToken: params.publicToken,
            title: params.title,
            status: 'draft',
            items: unitIds.map((unitId) => ({ unitId })),
            viewCount: 0,
            version: 0,
          }),
        ],
        { session: undefined },
      );
      expect(result).toBe(mockDoc);
    });
  });

  describe('findByIdForOrganization', () => {
    it('фильтрует по _id и organizationId (tenant isolation)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue(null);
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOne: findOneSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId });
    });
  });

  describe('findByPublicToken', () => {
    it('ищет БЕЗ organizationId — единственный ключ доступа публичной стороны это сам токен', async () => {
      const execSpy = jest.fn().mockResolvedValue(null);
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOne: findOneSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.findByPublicToken('token-value');

      expect(findOneSpy).toHaveBeenCalledWith({ publicToken: 'token-value' });
    });
  });

  describe('listForOrganization', () => {
    it('фильтрует по organizationId, сортирует по createdAt убыв.', async () => {
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.listForOrganization(organizationId);

      expect(findSpy).toHaveBeenCalledWith({ organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('добавляет status и createdByPositionId (own-scope) в фильтр, если переданы', async () => {
      const organizationId = new Types.ObjectId();
      const createdByPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.listForOrganization(organizationId, { status: 'sent', createdByPositionId });

      expect(findSpy).toHaveBeenCalledWith({ organizationId, status: 'sent', createdByPositionId });
    });
  });

  describe('updateWithVersionCheck', () => {
    it('CAS-обновление с проверкой expectedVersion и инкрементом version', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const patch = { title: 'Новое название' };

      await repository.updateWithVersionCheck(id, organizationId, 2, patch);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 2 },
        { $set: patch, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });
  });

  describe('setStatusWithVersionCheck', () => {
    it('проставляет sentAt при переходе в status sent', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.setStatusWithVersionCheck(id, organizationId, 0, 'sent');

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 0 },
        { $set: { status: 'sent', sentAt: expect.any(Date) }, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });

    it('не трогает sentAt для остальных статусов', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.setStatusWithVersionCheck(id, organizationId, 1, 'archived');

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 1 },
        { $set: { status: 'archived' }, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });
  });

  describe('deleteWithVersionCheck', () => {
    it('возвращает true при deletedCount > 0', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const deleteOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { deleteOne: deleteOneSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const success = await repository.deleteWithVersionCheck(id, organizationId, 0);

      expect(success).toBe(true);
    });

    it('возвращает false при deletedCount === 0', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ deletedCount: 0 });
      const deleteOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { deleteOne: deleteOneSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const success = await repository.deleteWithVersionCheck(id, organizationId, 5);

      expect(success).toBe(false);
    });
  });

  describe('addItemsWithVersionCheck', () => {
    it('добавляет только новые unitId (дедупликация против уже существующих items)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const existingUnitId = new Types.ObjectId();
      const newUnitId = new Types.ObjectId();

      const findOneExecSpy = jest.fn().mockResolvedValue({
        version: 3,
        items: [{ unitId: existingUnitId }],
      });
      const sessionSpy = jest.fn().mockReturnValue({ exec: findOneExecSpy });
      const findOneSpy = jest.fn().mockReturnValue({ session: sessionSpy });

      const updateExecSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: updateExecSpy });

      const mockModel = { findOne: findOneSpy, findOneAndUpdate: findOneAndUpdateSpy };
      const repository = new DevSelectionRepository(mockModel as never);

      await repository.addItemsWithVersionCheck(id, organizationId, 3, [existingUnitId, newUnitId]);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 3 },
        { $push: { items: { $each: [{ unitId: newUnitId }] } }, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });

    it('возвращает null, если подборка не найдена', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const findOneExecSpy = jest.fn().mockResolvedValue(null);
      const sessionSpy = jest.fn().mockReturnValue({ exec: findOneExecSpy });
      const findOneSpy = jest.fn().mockReturnValue({ session: sessionSpy });
      const mockModel = { findOne: findOneSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const result = await repository.addItemsWithVersionCheck(id, organizationId, 0, [new Types.ObjectId()]);

      expect(result).toBeNull();
    });
  });

  describe('updateItemWithVersionCheck', () => {
    it('обновляет agentNote/reaction конкретного item через arrayFilters', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const unitId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.updateItemWithVersionCheck(id, organizationId, 1, unitId, {
        agentNote: 'Хорошая планировка',
        reaction: 'liked',
      });

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 1, 'items.unitId': unitId },
        {
          $set: { 'items.$[elem].agentNote': 'Хорошая планировка', 'items.$[elem].reaction': 'liked' },
          $inc: { version: 1 },
        },
        { new: true, session: undefined, arrayFilters: [{ 'elem.unitId': unitId }] },
      );
    });

    it('reaction: null очищает поле через $unset, не $set', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const unitId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      await repository.updateItemWithVersionCheck(id, organizationId, 0, unitId, { reaction: null });

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 0, 'items.unitId': unitId },
        { $unset: { 'items.$[elem].reaction': '' }, $inc: { version: 1 } },
        { new: true, session: undefined, arrayFilters: [{ 'elem.unitId': unitId }] },
      );
    });
  });

  describe('markViewedByPublicToken', () => {
    it('атомарно инкрементирует viewCount и переводит sent->viewed (aggregation-pipeline update)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ id: 'viewed' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new DevSelectionRepository(mockModel as never);
      const result = await repository.markViewedByPublicToken('token-value');

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { publicToken: 'token-value' },
        [
          {
            $set: {
              viewCount: { $add: ['$viewCount', 1] },
              lastOpenedAt: '$$NOW',
              status: { $cond: [{ $eq: ['$status', 'sent'] }, 'viewed', '$status'] },
            },
          },
        ],
        { new: true },
      );
      expect(result).toEqual({ id: 'viewed' });
    });
  });
});
