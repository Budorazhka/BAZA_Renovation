import { Types } from 'mongoose';
import { SectionRepository } from './section.repository';

describe('SectionRepository', () => {
  describe('listForBuilding', () => {
    it('фильтр включает organizationId, не только buildingId', async () => {
      const buildingId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new SectionRepository(mockModel as never);
      await repository.listForBuilding(buildingId, organizationId);

      expect(findSpy).toHaveBeenCalledWith({ buildingId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ _id: 1 });
    });
  });
});
