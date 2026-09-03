import { Types } from 'mongoose';
import { LeadRepository } from './lead.repository';

describe('LeadRepository', () => {
  describe('distinctContactIdsForOwner', () => {
    it('фильтр включает organizationId И ownerPositionId, distinct по contactId', async () => {
      const organizationId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const distinctSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ distinct: distinctSpy } as never);

      await repository.distinctContactIdsForOwner(organizationId, ownerPositionId);

      expect(distinctSpy).toHaveBeenCalledWith('contactId', { organizationId, ownerPositionId });
    });
  });

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

  describe('listForOrganization', () => {
    it('без cursor — match без _id, сортировка по _id desc, lookup openTasks', async () => {
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ aggregate: aggregateSpy } as never);

      await repository.listForOrganization(organizationId, { limit: 21 });

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { organizationId, status: { $ne: 'deleted' } } },
          { $sort: { _id: -1 } },
          { $limit: 21 },
          expect.objectContaining({ $lookup: expect.anything() }),
        ]),
      );
    });

    it('с cursor — match включает _id: {$lt: cursor}', async () => {
      const organizationId = new Types.ObjectId();
      const cursor = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ aggregate: aggregateSpy } as never);

      await repository.listForOrganization(organizationId, { cursor, limit: 21 });

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { organizationId, status: { $ne: 'deleted' }, _id: { $lt: cursor } } },
          { $sort: { _id: -1 } },
        ]),
      );
    });

    it('фильтр stalled:true добавляет match { stalled: true } после вычисления', async () => {
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ aggregate: aggregateSpy } as never);

      await repository.listForOrganization(organizationId, { stalled: true, limit: 21 });

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          { $match: { stalled: true } },
          { $limit: 21 },
        ]),
      );
    });
  });

  describe('findLeadIdsForContact', () => {
    it('returns distinct lead IDs for contact and optional ownerPositionId', async () => {
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const distinctSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadRepository({ distinct: distinctSpy } as never);

      await repository.findLeadIdsForContact(organizationId, contactId, ownerPositionId);

      expect(distinctSpy).toHaveBeenCalledWith('_id', { organizationId, contactId, ownerPositionId });
    });
  });

  describe('create', () => {
    it('без явного stage — инициализирует stage:new (generic-путь по умолчанию)', async () => {
      const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
      const repository = new LeadRepository({ create: createSpy } as never);

      await repository.create({
        organizationId: new Types.ObjectId(),
        contactId: new Types.ObjectId(),
        source: { route: '/developments/zhk-solnechnyy' },
      });

      expect(createSpy).toHaveBeenCalledWith([expect.objectContaining({ stage: 'new' })], { session: undefined });
    });

    it('с явным stage/productType — сохраняет ровно то, что передал вызывающий (продуктовые воронки лида)', async () => {
      const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
      const repository = new LeadRepository({ create: createSpy } as never);

      await repository.create({
        organizationId: new Types.ObjectId(),
        contactId: new Types.ObjectId(),
        source: { route: 'manual' },
        productType: 'network',
        stage: 'network_rejected_defective',
      });

      expect(createSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ productType: 'network', stage: 'network_rejected_defective' })],
        { session: undefined },
      );
    });
  });
});
