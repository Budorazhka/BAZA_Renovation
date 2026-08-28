import { Types } from 'mongoose';
import { FloorRepository } from './floor.repository';

describe('FloorRepository', () => {
  describe('listForBuilding', () => {
    it('фильтр включает organizationId, не только buildingId; сортировка по floorNumber сохранена', async () => {
      const buildingId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new FloorRepository(mockModel as never);
      await repository.listForBuilding(buildingId, organizationId);

      expect(findSpy).toHaveBeenCalledWith({ buildingId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ floorNumber: 1 });
    });
  });
});
