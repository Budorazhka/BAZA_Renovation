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
        expectedVersion: 0,
        slug: 'test-development',
        seo: { title: 'T', description: 'D', canonicalUrl: 'https://x', structuredData: {} },
        denormalizedFields: { name: 'X' },
        searchProjection: { city: 'Tbilisi' },
      });

      const [filter] = updateOneSpy.mock.calls[0] as [{ status: string }];
      expect(filter.status).toBe('publication_pending');
    });

    /**
     * D-03 race-fix: version — тоже часть CAS-фильтра, не post-hoc сравнение
     * — защита от гонки между двумя последовательными PublicationRequested
     * событиями (например publish, затем rebuild), обработанными worker'ом
     * не в порядке создания.
     */
    it('условие фильтра включает version:expectedVersion', async () => {
      const id = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.markPublished(id, {
        expectedVersion: 5,
        slug: 'test-development',
        seo: { title: 'T', description: 'D', canonicalUrl: 'https://x', structuredData: {} },
        denormalizedFields: { name: 'X' },
        searchProjection: { city: 'Tbilisi' },
      });

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, status: 'publication_pending', version: 5 },
        expect.anything(),
      );
    });

    it('возвращает modifiedCount:0, если документ уже не в publication_pending (unpublish опередил worker)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.markPublished(new Types.ObjectId(), {
        expectedVersion: 0,
        slug: 'x',
        seo: { title: 'T', description: 'D', canonicalUrl: 'https://x', structuredData: {} },
        denormalizedFields: {},
        searchProjection: {},
      });

      expect(result).toEqual({ modifiedCount: 0 });
    });

    it('возвращает modifiedCount:0, если version не совпадает (более новое событие обработано раньше)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.markPublished(new Types.ObjectId(), {
        expectedVersion: 1, // устаревшая версия — реальный документ уже на version:2+
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
    it('без bbox/city фильтрует по status:published И sourceType:development', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listPublished({ limit: 20 });

      // sourceType:'development' guards against a future 'unit'-sourceType
      // publication mapper silently mixing unit cards into this list —
      // status alone isn't a complete filter now that PublicationSourceType
      // has three values, not one.
      expect(findSpy).toHaveBeenCalledWith({ status: 'published', sourceType: 'development' });
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

  describe('public page methods', () => {
    it('returns total from the same visibility filter and applies a stable price cursor', async () => {
      const id = new Types.ObjectId();
      const document = { _id: id };
      const findExec = jest.fn().mockResolvedValue([document]);
      const limitSpy = jest.fn().mockReturnValue({ exec: findExec });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const countExec = jest.fn().mockResolvedValue(7);
      const countDocumentsSpy = jest.fn().mockReturnValue({ exec: countExec });
      const mockModel = { find: findSpy, countDocuments: countDocumentsSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.listPublishedByFilterPage({
        sourceType: 'listing',
        city: 'Batumi',
        sort: 'price_asc',
        cursor: { id, value: 100 },
        limit: 3,
      });

      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          sourceType: 'listing',
          'searchProjection.city': 'Batumi',
          $or: [
            { 'searchProjection.priceAmountMinorUnits': { $gt: 100 } },
            { 'searchProjection.priceAmountMinorUnits': 100, _id: { $gt: id } },
          ],
        }),
      );
      expect(sortSpy).toHaveBeenCalledWith({ 'searchProjection.priceAmountMinorUnits': 1, _id: 1 });
      expect(countDocumentsSpy).toHaveBeenCalledWith({
        status: 'published',
        sourceType: 'listing',
        'searchProjection.city': 'Batumi',
      });
      expect(result).toEqual({ items: [document], total: 7 });
    });
  });

  describe('listForAdmin', () => {
    it('НЕ добавляет status:published — admin видит publication в любом статусе', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listForAdmin({ scopeFilter: { sourceType: 'development' }, limit: 20 });

      const [filter] = findSpy.mock.calls[0] as [Record<string, unknown>];
      expect(filter).not.toHaveProperty('status');
      expect(filter.sourceType).toBe('development');
    });

    it('исполняет scopeFilter как есть (не знает про PermissionGrant, только про Mongo-условие)', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const scopeFilter = { $or: [{ sourceType: 'development' }, { sourceType: 'unit' }] };
      await repository.listForAdmin({ scopeFilter, limit: 20 });

      expect(findSpy).toHaveBeenCalledWith(expect.objectContaining(scopeFilter));
    });

    it('cursor добавляет _id:{$gt:cursor} поверх scopeFilter', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };
      const cursor = new Types.ObjectId();

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listForAdmin({ scopeFilter: { sourceType: 'development' }, cursor, limit: 20 });

      expect(findSpy).toHaveBeenCalledWith({ sourceType: 'development', _id: { $gt: cursor } });
    });

    it('limit передаётся в .limit() как есть (limit+1 паттерн — забота вызывающего кода)', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const sortSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const findSpy = jest.fn().mockReturnValue({ sort: sortSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      await repository.listForAdmin({ scopeFilter: {}, limit: 21 });

      expect(limitSpy).toHaveBeenCalledWith(21);
      expect(sortSpy).toHaveBeenCalledWith({ _id: 1 });
    });
  });

  describe('listSourceIdsByScopeFilter', () => {
    it('исполняет scopeFilter как есть, проецирует только sourceType/sourceId (не полный документ)', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const findSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const scopeFilter = { sourceType: 'development', 'searchProjection.city': { $in: ['batumi'] } };
      await repository.listSourceIdsByScopeFilter(scopeFilter);

      expect(findSpy).toHaveBeenCalledWith(scopeFilter, { sourceType: 1, sourceId: 1 });
    });

    it('мапит результат в {sourceType, sourceId} пары', async () => {
      const sourceId = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue([{ sourceType: 'unit', sourceId }]);
      const findSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.listSourceIdsByScopeFilter({ sourceType: 'unit' });

      expect(result).toEqual([{ sourceType: 'unit', sourceId }]);
    });

    it('пустой результат — пустой массив, не undefined/null', async () => {
      const execSpy = jest.fn().mockResolvedValue([]);
      const findSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { find: findSpy };

      const repository = new MarketplacePublicationRepository(mockModel as never);
      const result = await repository.listSourceIdsByScopeFilter({ sourceType: 'listing' });

      expect(result).toEqual([]);
    });
  });
});
