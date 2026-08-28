import { Types } from 'mongoose';
import { FloorPlanRepository } from './floor-plan.repository';

describe('FloorPlanRepository', () => {
  describe('listForBuilding', () => {
    /** Метод не существовал вообще до D-02 COMPLETE — добавлен с нуля. */
    it('фильтр включает organizationId и buildingId', async () => {
      const buildingId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new FloorPlanRepository(mockModel as never);
      await repository.listForBuilding(buildingId, organizationId);

      expect(findSpy).toHaveBeenCalledWith({ buildingId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ _id: 1 });
    });
  });
});
