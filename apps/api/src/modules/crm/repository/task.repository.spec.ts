import { Types } from 'mongoose';
import { TaskRepository } from './task.repository';

describe('TaskRepository', () => {
  describe('create', () => {
    it('creates task document with organizationId, title, status and passes session', async () => {
      const organizationId = new Types.ObjectId();
      const createdTask = { _id: new Types.ObjectId(), organizationId, title: 'Call client', status: 'open' };
      const fakeSession = {} as never;
      const createSpy = jest.fn().mockResolvedValue([createdTask]);
      const repository = new TaskRepository({ create: createSpy } as never);

      const result = await repository.create(
        {
          organizationId,
          title: 'Call client',
          description: 'Discuss options',
          status: 'open',
        },
        fakeSession,
      );

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            organizationId,
            title: 'Call client',
            description: 'Discuss options',
            status: 'open',
          }),
        ],
        { session: fakeSession },
      );
      expect(result).toEqual(createdTask);
    });
  });

  describe('findByIdForOrganization', () => {
    it('applies organizationId in filter for tenant isolation', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new TaskRepository({ findOne: findOneSpy } as never);

      const res = await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId });
      expect(res).toEqual({ _id: id });
    });

    it('applies assignedPositionId in filter for own-scope scoping', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const assignedPositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new TaskRepository({ findOne: findOneSpy } as never);

      await repository.findByIdForOrganization(id, organizationId, assignedPositionId);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId, assignedPositionId });
    });

    it('passes session to findOne when provided', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const fakeSession = {} as never;
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new TaskRepository({ findOne: findOneSpy } as never);

      await repository.findByIdForOrganization(id, organizationId, undefined, fakeSession);

      expect(findOneSpy).toHaveBeenCalledWith({ _id: id, organizationId }, null, { session: fakeSession });
    });
  });

  describe('listForOrganization', () => {
    it('applies filters, cursor and limit with newest-first sort', async () => {
      const organizationId = new Types.ObjectId();
      const cursor = new Types.ObjectId();
      const assignedPositionId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const dueBefore = new Date();

      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new TaskRepository({ find: findSpy } as never);

      await repository.listForOrganization(organizationId, {
        assignedPositionId,
        leadId,
        status: 'open',
        dueBefore,
        cursor,
        limit: 21,
      });

      expect(findSpy).toHaveBeenCalledWith({
        organizationId,
        _id: { $lt: cursor },
        status: 'open',
        assignedPositionId,
        leadId,
        dueAt: { $lte: dueBefore },
      });
      expect(sortSpy).toHaveBeenCalledWith({ _id: -1 });
      expect(limitSpy).toHaveBeenCalledWith(21);
    });
  });

  describe('completeTask', () => {
    it('updates status to completed, sets completedAt and completedByPositionId within tenant', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const completedByPositionId = new Types.ObjectId();
      const fakeSession = {} as never;

      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new TaskRepository({ updateOne: updateOneSpy } as never);

      const res = await repository.completeTask(id, organizationId, completedByPositionId, fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId },
        {
          $set: {
            status: 'completed',
            completedAt: expect.any(Date),
            completedByPositionId,
          },
        },
        { session: fakeSession },
      );
      expect(res).toEqual({ modifiedCount: 1 });
    });
  });

  describe('countOpenForLead', () => {
    it('counts open tasks for given lead in organization', async () => {
      const organizationId = new Types.ObjectId();
      const leadId = new Types.ObjectId();

      const execSpy = jest.fn().mockResolvedValue(2);
      const countDocumentsSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new TaskRepository({ countDocuments: countDocumentsSpy } as never);

      const count = await repository.countOpenForLead(organizationId, leadId);

      expect(countDocumentsSpy).toHaveBeenCalledWith({ organizationId, leadId, status: 'open' });
      expect(count).toBe(2);
    });
  });
});
