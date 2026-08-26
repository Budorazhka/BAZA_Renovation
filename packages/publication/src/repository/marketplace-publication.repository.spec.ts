import { Types } from 'mongoose';
import { MarketplacePublicationRepository } from './marketplace-publication.repository';

describe('MarketplacePublicationRepository', () => {
  describe('upsertPending', () => {
    it('upsert по {sourceType, sourceId}, инкрементирует version, устанавливает publication_pending', async () => {
      const sourceId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const fakeSession = {} as never;
      const doc = { _id: new Types.ObjectId(), status: 'publication_pending' };
      const execSpy = jest.fn().mockResolvedValue(doc);
      const findOneAndUpdateSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOneAndUpdate: findOneAndUpdateSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.upsertPending(
        { sourceType: 'development', sourceId, publisherScope: { type: 'organization', organizationId } },
        fakeSession,
      );

      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        { sourceType: 'development', sourceId },
        expect.objectContaining({
          $set: { status: 'publication_pending', publisherScope: { type: 'organization', organizationId } },
          $inc: { version: 1 },
        }),
        { upsert: true, new: true, session: fakeSession },
      );
      expect(result).toBe(doc);
    });
  });

  describe('markPublished', () => {
    it('условие фильтра требует status:publication_pending (worker не затирает уже unpublished)', async () => {
      const id = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.markPublished(id, {
        slug: 'test-development',
        seo: { title: 'T', description: 'D', canonicalUrl: 'https://x', structuredData: {} },
        denormalizedFields: { name: 'X' },
        searchProjection: { city: 'Tbilisi' },
      });

      const [filter] = updateOneSpy.mock.calls[0] as [{ status: string }];
      expect(filter.status).toBe('publication_pending');
    });

    it('возвращает modifiedCount:0, если документ уже не в publication_pending (unpublish опередил worker)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.markPublished(new Types.ObjectId(), {
        slug: 'x',
        seo: { title: 'T', description: 'D', canonicalUrl: 'https://x', structuredData: {} },
        denormalizedFields: {},
        searchProjection: {},
      });

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('unpublish', () => {
    it('условие фильтра требует status:published, session обязателен', async () => {
      const sourceId = new Types.ObjectId();
      const fakeSession = {} as never;
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.unpublish('development', sourceId, 'Duplicate listing', fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { sourceType: 'development', sourceId, status: 'published' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'unpublished', unpublishReason: 'Duplicate listing' }),
        }),
        { session: fakeSession },
      );
    });
  });

  describe('findBySlug', () => {
    it('фильтрует по slug И status:published (не отдаёт unpublished/pending по slug)', async () => {
      const execSpy = jest.fn().mockResolvedValue(null);
      const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { findOne: findOneSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.findBySlug('test-slug');

      expect(findOneSpy).toHaveBeenCalledWith({ slug: 'test-slug', status: 'published' });
    });
  });

  describe('listPublished', () => {
    it('без bbox/city фильтрует только по status:published', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listPublished({ limit: 20 });

      expect(findSpy).toHaveBeenCalledWith({ status: 'published' });
    });

    it('с bbox добавляет $geoWithin/$box фильтр', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listPublished({
        limit: 20,
        bbox: { minLng: 44, minLat: 41, maxLng: 45, maxLat: 42 },
      });

      const [filter] = findSpy.mock.calls[0] as [{ 'searchProjection.geo': unknown }];
      expect(filter['searchProjection.geo']).toEqual({
        $geoWithin: { $box: [[44, 41], [45, 42]] },
      });
    });
  });
});
