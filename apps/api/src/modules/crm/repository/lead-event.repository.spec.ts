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
});
