import { Types } from 'mongoose';
import { BuildingRepository } from './building.repository';

describe('BuildingRepository', () => {
  describe('listForDevelopment', () => {
    /**
     * Регрессия на IDOR: старая сигнатура listForDevelopment(developmentId)
     * фильтровала ТОЛЬКО по parent id, без organizationId — building чужой
     * организации с тем же developmentId (структурно невозможно в реальных
     * данных, но защита должна быть в самом запросе, не полагаться на то,
     * что developmentId сам по себе уникален межу организациями) был бы
     * возвращён. Тест фиксирует, что organizationId — часть Mongo-фильтра.
     */
    it('фильтр включает organizationId, не только developmentId', async () => {
      const developmentId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([]);
      const sortSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new BuildingRepository(mockModel as never);
      await repository.listForDevelopment(developmentId, organizationId);

      expect(findSpy).toHaveBeenCalledWith({ developmentId, organizationId });
      expect(sortSpy).toHaveBeenCalledWith({ _id: 1 });
    });

    it('возвращает пустой массив, если building не найден', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const mockModel = { find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: execSpy }) }) };

      const repository = new BuildingRepository(mockModel as never);
      const result = await repository.listForDevelopment(new Types.ObjectId(), new Types.ObjectId());

      expect(result).toEqual([]);
    });
  });
});
