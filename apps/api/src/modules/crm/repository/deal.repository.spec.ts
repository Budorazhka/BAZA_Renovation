import { Types } from 'mongoose';
import { DealRepository } from './deal.repository';

describe('DealRepository', () => {
  describe('create', () => {
    it('creates deal document with tenant scope and version=0', async () => {
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const createdDeal = {
        _id: new Types.ObjectId(),
        organizationId,
        contactId,
        ownerPositionId,
        leadId,
        title: 'Deal 1',
        stage: 'showing',
        version: 0,
      };
      const fakeSession = {} as never;
      const createSpy = jest.fn().mockResolvedValue([createdDeal]);
      const repository = new DealRepository({ create: createSpy } as never);

      const result = await repository.create(
        {
          organizationId,
          contactId,
          ownerPositionId,
          leadId,
          title: 'Deal 1',
          description: 'Description 1',
          stage: 'showing',
          expectedCommission: { amountMinorUnits: 500000, currency: 'USD' },
        },
        fakeSession,
      );

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            organizationId,
            contactId,
            ownerPositionId,
            leadId,
            title: 'Deal 1',
            description: 'Description 1',
            stage: 'showing',
            expectedCommission: { amountMinorUnits: 500000, currency: 'USD' },
            version: 0,
          }),
        ],
        { session: fakeSession },
      );
      expect(result).toEqual(createdDeal);
    });
  });

  describe('findByIdForOrganization', () => {
    it('applies organizationId in filter for tenant isolation', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new DealRepository({ findOne: findOneSpy } as never);

      const res = await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId });
      expect(res).toEqual({ _id: id });
    });

    it('applies ownerPositionId in filter for own-scope scoping', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new DealRepository({ findOne: findOneSpy } as never);

      await repository.findByIdForOrganization(id, organizationId, ownerPositionId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId, ownerPositionId });
    });
  });

  describe('listForOrganization', () => {
    it('filters by stage, ownerPositionId, leadId, contactId and cursor', async () => {
      const organizationId = new Types.ObjectId();
      const ownerPositionId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const cursor = new Types.ObjectId();

      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new DealRepository({ find: findSpy } as never);

      await repository.listForOrganization(organizationId, {
        stage: 'deposit',
        ownerPositionId,
        leadId,
        contactId,
        cursor,
        limit: 10,
      });

      expect(findSpy).toHaveBeenCalledWith({
        organizationId,
        stage: 'deposit',
        ownerPositionId,
        leadId,
        contactId,
        _id: { $lt: cursor },
      });
      expect(sortSpy).toHaveBeenCalledWith({ _id: -1 });
      expect(limitSpy).toHaveBeenCalledWith(10);
    });
  });

  describe('changeStageWithVersionCheck', () => {
    it('updates stage atomically with version increment and allowed fromStages filter', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const fakeSession = {} as never;

      const updateOneSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });
      const repository = new DealRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.changeStageWithVersionCheck(
        id,
        organizationId,
        2,
        'deal',
        ['deposit'],
        fakeSession,
      );

      expect(updateOneSpy).toHaveBeenCalledWith(
        {
          _id: id,
          organizationId,
          version: 2,
          stage: { $in: ['deposit'] },
        },
        {
          $set: expect.objectContaining({ stage: 'deal' }),
          $inc: { version: 1 },
        },
        { session: fakeSession },
      );
      expect(result.modifiedCount).toBe(1);
    });
  });

  describe('addParticipant and removeParticipant', () => {
    it('addParticipant pushes unique participant and increments version', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const fakeSession = {} as never;

      const findOneAndUpdateSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: id }),
      });
      const repository = new DealRepository({ findOneAndUpdate: findOneAndUpdateSpy } as never);

      await repository.addParticipant(
        id,
        organizationId,
        { role: 'lawyer', contactId },
        fakeSession,
      );

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: id,
          organizationId,
          'participants.contactId': { $ne: contactId },
        },
        {
          $push: { participants: { role: 'lawyer', contactId } },
          $inc: { version: 1 },
          $set: expect.objectContaining({ updatedAt: expect.any(Date) }),
        },
        { new: true, session: fakeSession },
      );
    });

    it('removeParticipant pulls participant and increments version', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const contactId = new Types.ObjectId();
      const fakeSession = {} as never;

      const findOneAndUpdateSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: id }),
      });
      const repository = new DealRepository({ findOneAndUpdate: findOneAndUpdateSpy } as never);

      await repository.removeParticipant(id, organizationId, contactId, fakeSession);

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: id,
          organizationId,
          'participants.contactId': contactId,
        },
        {
          $pull: { participants: { contactId } },
          $inc: { version: 1 },
          $set: expect.objectContaining({ updatedAt: expect.any(Date) }),
        },
        { new: true, session: fakeSession },
      );
    });
  });
});
