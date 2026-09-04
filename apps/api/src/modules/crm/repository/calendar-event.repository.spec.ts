import { Types } from 'mongoose';
import { CalendarEventRepository } from './calendar-event.repository';

describe('CalendarEventRepository', () => {
  describe('create', () => {
    it('creates calendar event document with tenant scope and version=0 default', async () => {
      const organizationId = new Types.ObjectId();
      const createdByPositionId = new Types.ObjectId();
      const createdEvent = {
        _id: new Types.ObjectId(),
        organizationId,
        title: 'Показ ЖК Олимп',
        startTime: new Date('2026-09-10T10:00:00.000Z'),
        endTime: new Date('2026-09-10T11:00:00.000Z'),
        createdByPositionId,
        version: 0,
      };
      const createSpy = jest.fn().mockResolvedValue([createdEvent]);
      const fakeSession = {} as never;
      const repository = new CalendarEventRepository({ create: createSpy } as never);

      const result = await repository.create(
        {
          organizationId,
          title: 'Показ ЖК Олимп',
          startTime: createdEvent.startTime,
          endTime: createdEvent.endTime,
          createdByPositionId,
        },
        fakeSession,
      );

      expect(createSpy).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            organizationId,
            title: 'Показ ЖК Олимп',
            startTime: createdEvent.startTime,
            endTime: createdEvent.endTime,
            createdByPositionId,
          }),
        ],
        { session: fakeSession },
      );
      expect(result).toEqual(createdEvent);
    });
  });

  describe('findByIdForOrganization', () => {
    it('excludes soft-deleted events and applies tenant isolation', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ _id: id });
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new CalendarEventRepository({ findOne: findOneSpy } as never);

      const res = await repository.findByIdForOrganization(id, organizationId);

      expect(findOneSpy).toHaveBeenCalledWith({
        _id: id,
        organizationId,
        deletedAt: { $exists: false },
      });
      expect(res).toEqual({ _id: id });
    });

    it('own-scope: matches createdByPositionId OR participants (не равенство одного поля)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const scopePositionId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue(null);
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new CalendarEventRepository({ findOne: findOneSpy } as never);

      await repository.findByIdForOrganization(id, organizationId, scopePositionId);

      expect(findOneSpy).toHaveBeenCalledWith({
        _id: id,
        organizationId,
        deletedAt: { $exists: false },
        $or: [{ createdByPositionId: scopePositionId }, { participants: scopePositionId }],
      });
    });
  });

  describe('listForRange', () => {
    it('filters by overlap with [startDate, endDate], type, leadId, dealId', async () => {
      const organizationId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const dealId = new Types.ObjectId();
      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-09-30T23:59:59.000Z');

      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new CalendarEventRepository({ find: findSpy } as never);

      await repository.listForRange(organizationId, {
        startDate,
        endDate,
        type: 'meeting',
        leadId,
        dealId,
      });

      expect(findSpy).toHaveBeenCalledWith({
        organizationId,
        deletedAt: { $exists: false },
        startTime: { $lte: endDate },
        endTime: { $gte: startDate },
        type: 'meeting',
        leadId,
        dealId,
      });
      expect(sortSpy).toHaveBeenCalledWith({ startTime: 1 });
    });

    it('applies own-scope $or filter when scopePositionId is provided', async () => {
      const organizationId = new Types.ObjectId();
      const scopePositionId = new Types.ObjectId();
      const startDate = new Date('2026-09-01T00:00:00.000Z');
      const endDate = new Date('2026-09-30T23:59:59.000Z');

      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new CalendarEventRepository({ find: findSpy } as never);

      await repository.listForRange(organizationId, { startDate, endDate, scopePositionId });

      expect(findSpy).toHaveBeenCalledWith({
        organizationId,
        deletedAt: { $exists: false },
        startTime: { $lte: endDate },
        endTime: { $gte: startDate },
        $or: [{ createdByPositionId: scopePositionId }, { participants: scopePositionId }],
      });
    });
  });

  describe('updateEvent', () => {
    it('uses expectedVersion in the conditional update filter and increments version', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const fakeSession = {} as never;
      const updateOneSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });
      const repository = new CalendarEventRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.updateEvent(
        id,
        organizationId,
        3,
        { title: 'Обновлённая встреча', description: null },
        fakeSession,
      );

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 3, deletedAt: { $exists: false } },
        {
          $set: { title: 'Обновлённая встреча' },
          $unset: { description: 1 },
          $inc: { version: 1 },
        },
        { session: fakeSession },
      );
      expect(result.modifiedCount).toBe(1);
    });
  });

  describe('moveEvent', () => {
    it('updates startTime/endTime atomically with version increment (CAS)', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const newStartTime = new Date('2026-09-10T12:00:00.000Z');
      const newEndTime = new Date('2026-09-10T13:00:00.000Z');
      const fakeSession = {} as never;
      const updateOneSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });
      const repository = new CalendarEventRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.moveEvent(id, organizationId, 1, newStartTime, newEndTime, fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, version: 1, deletedAt: { $exists: false } },
        { $set: { startTime: newStartTime, endTime: newEndTime }, $inc: { version: 1 } },
        { session: fakeSession },
      );
      expect(result.modifiedCount).toBe(1);
    });

    it('stale expectedVersion — modifiedCount 0, no throw at repository level', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const updateOneSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      });
      const repository = new CalendarEventRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.moveEvent(id, organizationId, 99, new Date(), new Date());

      expect(result.modifiedCount).toBe(0);
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and excludes already-deleted events from the filter', async () => {
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const deletedAt = new Date('2026-09-04T00:00:00.000Z');
      const fakeSession = {} as never;
      const updateOneSpy = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });
      const repository = new CalendarEventRepository({ updateOne: updateOneSpy } as never);

      const result = await repository.softDelete(id, organizationId, deletedAt, fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, organizationId, deletedAt: { $exists: false } },
        { $set: { deletedAt } },
        { session: fakeSession },
      );
      expect(result.modifiedCount).toBe(1);
    });
  });
});
