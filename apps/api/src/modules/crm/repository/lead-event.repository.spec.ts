import { Types } from 'mongoose';
import { LeadEventRepository } from './lead-event.repository';

describe('LeadEventRepository', () => {
  describe('append', () => {
    it('пишет запись как есть, без session по умолчанию', async () => {
      const createSpy = jest.fn().mockResolvedValue([{}]);
      const repository = new LeadEventRepository({ create: createSpy } as never);
      const params = {
        leadId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        stage: 'new' as const,
        changedBy: { type: 'system' as const },
      };

      await repository.append(params);

      expect(createSpy).toHaveBeenCalledWith([params], { session: undefined });
    });
  });

  describe('listForLead', () => {
    it('без cursor — фильтр по leadId+organizationId, сортировка _id desc', async () => {
      const leadId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new LeadEventRepository({ find: findSpy } as never);

      await repository.listForLead(leadId, organizationId, { limit: 21 });

      expect(findSpy).toHaveBeenCalledWith({ leadId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ _id: -1 });
      expect(limitSpy).toHaveBeenCalledWith(21);
    });

    it('с cursor — фильтр включает _id: {$lt: cursor} (tenant-escape защита сохранена, organizationId остаётся в фильтре)', async () => {
      const leadId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const cursor = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const repository = new LeadEventRepository({ find: findSpy } as never);

      await repository.listForLead(leadId, organizationId, { cursor, limit: 21 });

      expect(findSpy).toHaveBeenCalledWith({ leadId, organizationId, _id: { $lt: cursor } });
    });
  });

  describe('aggregateStageFunnel', () => {
    it('без stages/from/to — match содержит только organizationId, пайплайн схлопывает повторы по (leadId, stage) до подсчёта', async () => {
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadEventRepository({ aggregate: aggregateSpy } as never);

      await repository.aggregateStageFunnel(organizationId, {});

      expect(aggregateSpy).toHaveBeenCalledWith([
        { $match: { organizationId } },
        { $group: { _id: { leadId: '$leadId', stage: '$stage' } } },
        { $group: { _id: '$_id.stage', leadCount: { $sum: 1 } } },
        { $project: { _id: 0, stage: '$_id', leadCount: 1 } },
      ]);
    });

    it('stages фильтрует по $in, from/to собираются в один $match.changedAt', async () => {
      const organizationId = new Types.ObjectId();
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-02-01T00:00:00.000Z');
      const execSpy = jest.fn().mockResolvedValue([]);
      const aggregateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const repository = new LeadEventRepository({ aggregate: aggregateSpy } as never);

      await repository.aggregateStageFunnel(organizationId, { stages: ['new', 'contacted'], from, to });

      expect(aggregateSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          {
            $match: {
              organizationId,
              stage: { $in: ['new', 'contacted'] },
              changedAt: { $gte: from, $lte: to },
            },
          },
        ]),
      );
    });
  });
});
