import { Types } from 'mongoose';
import type { MarketplacePublicationRepository } from '@baza/publication';
import { PublicListingsController } from './public-listings.controller';
import { SearchPublicListingsQueryDto } from './dto/search-public-listings-query.dto';

/**
 * MKT-002 hardening: тот же regression-тест на whitelist-границу, что
 * public.controller.spec.ts уже применяет к toPublicCard (Development) —
 * до этого прохода PublicListingsController не имел собственного
 * controller-level теста вообще (только транзитивное покрытие через один
 * integration-сценарий). Если denormalizedFields/seo когда-либо (по ошибке
 * worker-side mapper'а, listing-publication.mapper.ts) содержит internal-
 * поле, public HTTP response не должен его содержать НЕЗАВИСИМО от worker'а.
 */
describe('PublicListingsController — whitelist границы public response', () => {
  const LEAKED_FIELDS = [
    'organizationId',
    'identityId',
    'representativePhone',
    'sourceId',
    'sourceType',
    'version',
    'contact',
    'internalNotes',
    'publisherScope',
    'propertyAssetId',
    'randomArbitraryField',
  ];
  const LEAKED_SEO_FIELDS = ['internalNotes', 'organizationId', 'randomArbitraryField'];

  function makeContaminatedPublication(overrides?: { slug?: string; sourceType?: string }) {
    return {
      _id: new Types.ObjectId(),
      slug: overrides?.slug ?? 'apartment-sale-batumi',
      sourceType: overrides?.sourceType ?? 'listing',
      status: 'published' as const,
      // Симулирует ошибку worker-side mapper'а — internal-поля случайно
      // попали в denormalizedFields, которого по контракту быть не должно.
      denormalizedFields: {
        dealType: 'sale',
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
        propertyType: 'apartment',
        commercialSubtype: undefined,
        location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 1' },
        characteristics: { area: 55, rooms: 2, floor: 5, totalFloors: 12 },
        organizationId: new Types.ObjectId().toString(),
        identityId: new Types.ObjectId().toString(),
        representativePhone: '+995500999888',
        sourceId: new Types.ObjectId().toString(),
        version: 3,
        contact: { phone: '+995500000000', whatsapp: '+995500000001' },
        internalNotes: 'Секретная заметка для менеджера, не для публики',
        publisherScope: { type: 'marketplace_account', identityId: new Types.ObjectId().toString() },
        propertyAssetId: new Types.ObjectId().toString(),
        randomArbitraryField: 'что угодно, чего worker не должен был класть',
      },
      searchProjection: {
        geo: { type: 'Point', coordinates: [41.64, 41.62] },
        organizationId: new Types.ObjectId().toString(),
      },
      // seo — тоже потенциальный вектор утечки (найдено ревью): предыдущая
      // версия контроллера передавала publication.seo целиком без
      // whitelist. Fixture намеренно загрязняет и его.
      seo: {
        title: 'Квартира — Продажа — Batumi',
        description: 'Тест',
        canonicalUrl: '/listings/apartment-sale-batumi',
        structuredData: { '@context': 'https://schema.org', '@type': 'RealEstateListing' },
        internalNotes: 'не должно попасть в ответ',
        organizationId: new Types.ObjectId().toString(),
        randomArbitraryField: 'мусор',
      },
    };
  }

  function assertNoLeakedFields(body: Record<string, unknown>) {
    for (const field of LEAKED_FIELDS) {
      expect(body).not.toHaveProperty(field);
    }
    const seo = body.seo as Record<string, unknown> | undefined;
    if (seo) {
      for (const field of LEAKED_SEO_FIELDS) {
        expect(seo).not.toHaveProperty(field);
      }
    }
  }

  function makeController(listPublishedResult: unknown[], findBySlugResult: unknown) {
    const repository = {
      listPublishedByFilterPage: jest.fn().mockResolvedValue({ items: listPublishedResult, total: listPublishedResult.length }),
      findBySlug: jest.fn().mockResolvedValue(findBySlugResult),
    } as unknown as MarketplacePublicationRepository;
    return new PublicListingsController(repository);
  }

  describe('GET /public/listings (list)', () => {
    it('загрязнённый denormalizedFields/seo не протекает в список — только whitelist-поля', async () => {
      const contaminated = makeContaminatedPublication();
      const controller = makeController([contaminated], null);
      const query = Object.assign(new SearchPublicListingsQueryDto(), { limit: 20 });

      const result = await controller.searchPublicListings(query);

      expect(result.items).toHaveLength(1);
      assertNoLeakedFields(result.items[0] as Record<string, unknown>);
      // Whitelist-поля при этом реально присутствуют — не пустой объект.
      expect(result.items[0]).toMatchObject({
        slug: 'apartment-sale-batumi',
        dealType: 'sale',
        propertyType: 'apartment',
        price: { amountMinorUnits: 10_000_000, currency: 'USD' },
        location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 1' },
      });
      expect((result.items[0] as { location: { geo: unknown } }).location.geo).toEqual({
        type: 'Point',
        coordinates: [41.64, 41.62],
      });
      expect((result.items[0] as { seo: Record<string, unknown> }).seo).toMatchObject({
        title: 'Квартира — Продажа — Batumi',
        canonicalUrl: '/listings/apartment-sale-batumi',
      });
    });

    it('возвращает total и непрозрачный составной cursor для price-сортировки', async () => {
      const first = makeContaminatedPublication();
      const second = { ...makeContaminatedPublication(), _id: new Types.ObjectId(), slug: 'second' };
      const repository = {
        listPublishedByFilterPage: jest.fn().mockResolvedValue({ items: [first, second], total: 4 }),
      } as unknown as MarketplacePublicationRepository;
      const controller = new PublicListingsController(repository);
      const query = Object.assign(new SearchPublicListingsQueryDto(), { limit: 1, sort: 'price_asc' });

      const result = await controller.searchPublicListings(query);

      expect(result.total).toBe(4);
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeTruthy();
      expect(result.nextCursor).not.toBe(first._id.toString());
    });
  });

  describe('GET /public/listings/:slug (detail)', () => {
    it('загрязнённый denormalizedFields/seo не протекает в detail — только whitelist-поля', async () => {
      const contaminated = makeContaminatedPublication();
      const controller = makeController([], contaminated);

      const result = (await controller.getPublicListing('apartment-sale-batumi')) as Record<string, unknown>;

      assertNoLeakedFields(result);
      expect(result).toMatchObject({ slug: 'apartment-sale-batumi', dealType: 'sale', propertyType: 'apartment' });
    });

    it('slug, принадлежащий Development (sourceType!==listing), даёт единый 404 — не раскрывает существование чужого sourceType', async () => {
      const developmentPublication = makeContaminatedPublication({ sourceType: 'development' });
      const controller = makeController([], developmentPublication);

      await expect(controller.getPublicListing('apartment-sale-batumi')).rejects.toThrow('Publication not found');
    });

    it('несуществующий slug даёт единый 404 (не отличим от "принадлежит другому sourceType")', async () => {
      const controller = makeController([], null);

      await expect(controller.getPublicListing('does-not-exist')).rejects.toThrow('Publication not found');
    });
  });

  describe('SEARCH-001: bbox/polygon geo-фильтр', () => {
    it('bbox и polygon одновременно — 400, репозиторий не вызывается', async () => {
      const listPublishedByFilterPage = jest.fn();
      const repository = { listPublishedByFilterPage } as unknown as MarketplacePublicationRepository;
      const controller = new PublicListingsController(repository);
      const query = Object.assign(new SearchPublicListingsQueryDto(), {
        limit: 20,
        bbox: '44,41,45,42',
        polygon: '44,41,45,41,44.5,42',
      });

      await expect(controller.searchPublicListings(query)).rejects.toThrow('bbox и polygon нельзя передавать одновременно');
      expect(listPublishedByFilterPage).not.toHaveBeenCalled();
    });

    it('polygon без bbox — парсится и передаётся в репозиторий как GeoJSON Polygon', async () => {
      const listPublishedByFilterPage = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const repository = { listPublishedByFilterPage } as unknown as MarketplacePublicationRepository;
      const controller = new PublicListingsController(repository);
      const query = Object.assign(new SearchPublicListingsQueryDto(), { limit: 20, polygon: '44,41,45,41,44.5,42' });

      await controller.searchPublicListings(query);

      expect(listPublishedByFilterPage).toHaveBeenCalledWith(
        expect.objectContaining({
          polygon: { type: 'Polygon', coordinates: [[[44, 41], [45, 41], [44.5, 42], [44, 41]]] },
        }),
      );
    });
  });
});
