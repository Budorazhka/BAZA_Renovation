import { Types } from 'mongoose';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { OrganizationsService } from '../organizations/organizations.service';
import { PublicController } from './public.controller';
import { SearchPublicDevelopmentsQueryDto } from './dto/search-public-developments-query.dto';

/**
 * D-04A: явный regression-тест на whitelist-границу toPublicCard. Требование
 * пользователя (после review) — если denormalizedFields когда-либо (по
 * ошибке worker-side mapper'а) содержит internal-поле, public HTTP response
 * его не содержит НЕЗАВИСИМО от worker'а — это отдельная, вторая граница
 * защиты, не просто развёртка уже "доверенной" структуры.
 */
describe('PublicController — whitelist границы public response', () => {
  const LEAKED_FIELDS = ['organizationId', 'sourceId', 'version', 'contact', 'internalNotes', 'publisherScope', 'randomArbitraryField'];
  const LEAKED_SEO_FIELDS = ['internalNotes', 'organizationId', 'randomArbitraryField'];

  function makeContaminatedPublication(overrides?: { slug?: string; sourceType?: string }) {
    return {
      _id: new Types.ObjectId(),
      slug: overrides?.slug ?? 'zhk-test',
      sourceType: overrides?.sourceType ?? 'development',
      status: 'published' as const,
      // Симулирует ошибку worker-side mapper'а — internal-поля случайно
      // попали в denormalizedFields, которого по контракту быть не должно.
      denormalizedFields: {
        name: 'ЖК Тест',
        location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 1' },
        classType: 'business',
        startDate: '2026-01-01',
        completionDate: '2027-01-01',
        description: 'Описание',
        organizationId: new Types.ObjectId().toString(),
        sourceId: new Types.ObjectId().toString(),
        version: 3,
        contact: { phone: '+995500000000', whatsapp: '+995500000001' },
        internalNotes: 'Секретная заметка для менеджера, не для публики',
        publisherScope: { type: 'organization', organizationId: new Types.ObjectId().toString() },
        randomArbitraryField: 'что угодно, чего worker не должен был класть',
      },
      searchProjection: {
        geo: { type: 'Point', coordinates: [41.64, 41.62] },
        organizationId: new Types.ObjectId().toString(),
      },
      // seo — тоже потенциальный вектор утечки (тот же класс находки, что
      // уже покрыт для PublicListingsController): toPublicCard раньше
      // передавал publication.seo целиком без whitelist. Fixture намеренно
      // загрязняет и его, зеркалируя public-listings.controller.spec.ts.
      seo: {
        title: 'ЖК Тест',
        description: 'Описание',
        canonicalUrl: '/developments/zhk-test',
        structuredData: {},
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

  // Публикатор карточки читается из organizations на том же запросе (см.
  // publisher-lookup.ts). В этих тестах организации не участвуют, поэтому
  // заглушка возвращает пустой список: publisher в карточке будет undefined.
  function makeOrganizationsService() {
    return { listPublicOrganizations: jest.fn().mockResolvedValue([]) } as unknown as OrganizationsService;
  }

  function makeController(listPublishedResult: unknown[], findBySlugResult: unknown) {
    const repository = {
      listPublishedPage: jest.fn().mockResolvedValue({ items: listPublishedResult, total: listPublishedResult.length }),
      findBySlug: jest.fn().mockResolvedValue(findBySlugResult),
    } as unknown as MarketplacePublicationRepository;
    return new PublicController(repository, makeOrganizationsService());
  }

  describe('GET /public/developments (list)', () => {
    it('загрязнённый denormalizedFields не протекает в список — только whitelist-поля', async () => {
      const contaminated = makeContaminatedPublication();
      const controller = makeController([contaminated], null);
      const query = Object.assign(new SearchPublicDevelopmentsQueryDto(), { limit: 20 });

      const result = await controller.searchPublicDevelopments(query);

      expect(result.items).toHaveLength(1);
      assertNoLeakedFields(result.items[0] as Record<string, unknown>);
      // Whitelist-поля при этом реально присутствуют — не пустой объект.
      expect(result.items[0]).toMatchObject({
        slug: 'zhk-test',
        name: 'ЖК Тест',
        location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 1', geo: { type: 'Point', coordinates: [41.64, 41.62] } },
        classType: 'business',
      });
    });
  });

  describe('GET /public/developments/:slug (detail)', () => {
    it('загрязнённый denormalizedFields/seo не протекает в detail — только whitelist-поля', async () => {
      const contaminated = makeContaminatedPublication();
      const controller = makeController([], contaminated);

      const result = (await controller.getPublicDevelopment('zhk-test')) as Record<string, unknown>;

      assertNoLeakedFields(result);
      expect(result).toMatchObject({ slug: 'zhk-test', name: 'ЖК Тест' });
      expect(result.seo).toMatchObject({
        title: 'ЖК Тест',
        description: 'Описание',
        canonicalUrl: '/developments/zhk-test',
      });
    });

    it('slug, принадлежащий Listing (sourceType!==development), даёт единый 404 — не раскрывает существование чужого sourceType', async () => {
      const listingPublication = makeContaminatedPublication({ sourceType: 'listing' });
      const controller = makeController([], listingPublication);

      await expect(controller.getPublicDevelopment('zhk-test')).rejects.toThrow('Publication not found');
    });

    it('несуществующий slug даёт единый 404 (не отличим от "принадлежит другому sourceType")', async () => {
      const controller = makeController([], null);

      await expect(controller.getPublicDevelopment('does-not-exist')).rejects.toThrow('Publication not found');
    });
  });

  describe('SEARCH-001: bbox/polygon geo-фильтр', () => {
    it('bbox и polygon одновременно — 400, репозиторий не вызывается', async () => {
      const listPublishedPage = jest.fn();
      const repository = { listPublishedPage } as unknown as MarketplacePublicationRepository;
      const controller = new PublicController(repository, makeOrganizationsService());
      const query = Object.assign(new SearchPublicDevelopmentsQueryDto(), {
        limit: 20,
        bbox: '44,41,45,42',
        polygon: '44,41,45,41,44.5,42',
      });

      await expect(controller.searchPublicDevelopments(query)).rejects.toThrow('bbox и polygon нельзя передавать одновременно');
      expect(listPublishedPage).not.toHaveBeenCalled();
    });

    it('polygon без bbox — парсится и передаётся в репозиторий как GeoJSON Polygon', async () => {
      const listPublishedPage = jest.fn().mockResolvedValue({ items: [], total: 0 });
      const repository = { listPublishedPage } as unknown as MarketplacePublicationRepository;
      const controller = new PublicController(repository, makeOrganizationsService());
      const query = Object.assign(new SearchPublicDevelopmentsQueryDto(), { limit: 20, polygon: '44,41,45,41,44.5,42' });

      await controller.searchPublicDevelopments(query);

      expect(listPublishedPage).toHaveBeenCalledWith(
        expect.objectContaining({
          polygon: { type: 'Polygon', coordinates: [[[44, 41], [45, 41], [44.5, 42], [44, 41]]] },
        }),
      );
    });
  });
});
