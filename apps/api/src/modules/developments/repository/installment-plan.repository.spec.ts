import { Types } from 'mongoose';
import { InstallmentPlanRepository } from './installment-plan.repository';

describe('InstallmentPlanRepository', () => {
  describe('create', () => {
    it('создаёт план с версией 0 и значениями по умолчанию', async () => {
      const mockDoc = { id: 'plan-1' };
      const createSpy = jest.fn().mockResolvedValue([mockDoc]);
      const mockModel = { create: createSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      const params = {
        organizationId: new Types.ObjectId(),
        developmentId: new Types.ObjectId(),
        title: 'Стандартная 30/70',
        downPaymentType: 'percent' as const,
        downPaymentValue: 30,
        termType: 'months_from_current_date' as const,
        termMonths: 24,
        paymentFrequency: 'monthly' as const,
      };

      const result = await repository.create(params);

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            ...params,
            isActive: true,
            applyTo: 'project',
            useDiscount: false,
            sortOrder: 0,
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

      const repository = new InstallmentPlanRepository(mockModel as never);
      await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId });
    });
  });

  describe('listForDevelopment', () => {
    it('фильтрует по developmentId и organizationId со стабильной сортировкой', async () => {
      const developmentId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      await repository.listForDevelopment(developmentId, organizationId);

      expect(findSpy).toHaveBeenCalledWith({ developmentId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ sortOrder: 1, createdAt: 1 });
    });

    it('добавляет unitId в фильтр, если передан', async () => {
      const developmentId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const unitId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      await repository.listForDevelopment(developmentId, organizationId, { unitId });

      expect(findSpy).toHaveBeenCalledWith({ developmentId, organizationId, unitId });
    });
  });

  describe('updateWithVersionCheck', () => {
    it('выполняет CAS-обновление с проверкой expectedVersion и инкрементом version', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ id: 'updated' });
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      const patch = { title: 'Новое название', downPaymentValue: 40 };

      await repository.updateWithVersionCheck(id, organizationId, 2, patch);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 2 },
        { $set: patch, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });
  });

  describe('deleteWithVersionCheck', () => {
    it('удаляет запись с проверкой expectedVersion и возвращает true при успехе', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const deleteOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { deleteOne: deleteOneSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      const success = await repository.deleteWithVersionCheck(id, organizationId, 0);

      expect(deleteOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 0 },
        { session: undefined },
      );
      expect(success).toBe(true);
    });

    it('возвращает false, если deletedCount === 0 (версия не совпала или запись отсутствует)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ deletedCount: 0 });
      const deleteOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { deleteOne: deleteOneSpy };

      const repository = new InstallmentPlanRepository(mockModel as never);
      const success = await repository.deleteWithVersionCheck(id, organizationId, 5);

      expect(success).toBe(false);
    });
  });
});
