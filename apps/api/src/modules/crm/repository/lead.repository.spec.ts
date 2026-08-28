import { Types } from 'mongoose';
import { LeadRepository } from './lead.repository';

describe('LeadRepository', () => {
  describe('assignOwner', () => {
    it('фильтр включает organizationId, не только _id — tenant-escape защита', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ updateOne: updateOneSpy } as never);

      await repository.assignOwner(id, organizationId, ownerPositionId);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId },
        { $set: { ownerPositionId } },
        { session: undefined },
      );
    });

    /**
     * Реальный найденный баг (second-opinion ревью): assignLead вызывал
     * assignOwner БЕЗ session внутри runInTransaction — запись владельца
     * лида не откатывалась при откате транзакции, хотя audit/event писались
     * откаченными. Эта проверка защищает от регрессии.
     */
    it('передаёт session дальше в updateOne — write остаётся частью transaction', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const fakeSession = {} as never;
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ updateOne: updateOneSpy } as never);

      await repository.assignOwner(id, organizationId, ownerPositionId, fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId },
        { $set: { ownerPositionId } },
        { session: fakeSession },
      );
    });
  });

  describe('changeStageWithVersionCheck', () => {
    it('фильтр включает organizationId, version и allowedFromStages — tenant-escape + optimistic concurrency защита', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const fakeSession = {} as never;
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ updateOne: updateOneSpy } as never);

      await repository.changeStageWithVersionCheck(id, organizationId, 3, 'qualified', ['contacted'], fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 3, stage: { $in: ['contacted'] } },
        { $set: { stage: 'qualified' }, $inc: { version: 1 } },
        { session: fakeSession },
      );
    });
  });

  describe('create', () => {
    it('всегда инициализирует stage:new вне зависимости от переданных params', async () => {
      const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
      const repository = new LeadRepository({ create: createSpy } as never);

      await repository.create({
        organizationId: new Types.ObjectId(),
        contactId: new Types.ObjectId(),
        source: { route: '/developments/zhk-solnechnyy' },
      });

      expect(createSpy).toHaveBeenCalledWith([expect.objectContaining({ stage: 'new' })], { session: undefined });
    });
  });
});
