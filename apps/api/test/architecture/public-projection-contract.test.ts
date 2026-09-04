import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import type { MarketplacePublicationRepository } from '@baza/publication';
import { PublicController } from '../../src/modules/publication/public.controller';
import { PublicListingsController } from '../../src/modules/publication/public-listings.controller';
import { SearchPublicDevelopmentsQueryDto } from '../../src/modules/publication/dto/search-public-developments-query.dto';
import { SearchPublicListingsQueryDto } from '../../src/modules/publication/dto/search-public-listings-query.dto';

/**
 * Публикатор карточки читается из organizations на том же запросе
 * (publisher-lookup.ts). Этот тест проверяет контракт полей, организации в
 * нём не участвуют: заглушка отдаёт пустой список, publisher остаётся
 * undefined и в контракт не попадает.
 */
function emptyOrganizationsService() {
  return { listPublicOrganizations: async () => [] } as unknown as never;
}

/**
 * Публичная карточка отдаёт ровно те поля, которые обещает контракт.
 *
 * ЗАЧЕМ, и почему этого не покрывают существующие тесты. `public.controller.spec`
 * и `public-listings.controller.spec` проверяют границу с другой стороны: берут
 * список известных внутренних полей (`organizationId`, `contact`,
 * `internalNotes`…) и убеждаются, что их в ответе нет. Это чёрный список — он
 * ловит то, о чём успели подумать.
 *
 * Здесь проверка встречная и полная: множество полей ответа сравнивается с
 * множеством полей схемы в OpenAPI. Поле, которого нет в контракте, уходит
 * наружу без ревью — а публичная поверхность это то, что потом нельзя убрать,
 * не сломав чужие интеграции. Обратное расхождение тоже ловится: контракт
 * обещает поле, которого карточка не отдаёт.
 *
 * Проверка идёт по ЗНАЧЕНИЯМ реального ответа, а не по чтению исходников:
 * страж вызывает контроллеры на загрязнённой публикации и смотрит, что вышло.
 */

const SPEC_PATH = join(__dirname, '../../../../docs/api/v1-first-vertical-slice.yaml');

/**
 * Поле обещано контрактом, но карточка его не отдаёт → почему это осознанно.
 * Список должен быть коротким и обязан сокращаться, а не расти.
 */
const DECLARED_BUT_NOT_PRODUCED: Record<string, string> = {
  'PublicDevelopmentCard.priceFrom':
    'требует агрегации минимальной цены по Unit-коллекции, к которой worker не имеет доступа; зафиксировано в mapDevelopmentToDenormalizedFields как отсутствующее, а не забытое',
};

/** Ключи `properties:` именованной схемы OpenAPI. Разбор построчный — YAML-парсера в apps/api нет. */
function schemaProperties(schemaName: string): string[] {
  const lines = readFileSync(SPEC_PATH, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line === `    ${schemaName}:`);
  if (start < 0) throw new Error(`Схема ${schemaName} не найдена в контракте`);

  const properties: string[] = [];
  let insideProperties = false;

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= 4) break; // следующая схема

    if (indent === 6 && line.trim() === 'properties:') {
      insideProperties = true;
      continue;
    }
    if (indent <= 6 && insideProperties) {
      insideProperties = false;
      continue;
    }
    if (insideProperties && indent === 8) {
      properties.push(line.trim().replace(/:.*$/, ''));
    }
  }

  if (properties.length === 0) throw new Error(`У схемы ${schemaName} не разобрано ни одного поля`);
  return properties.sort();
}

function developmentPublication() {
  return {
    _id: new Types.ObjectId(),
    slug: 'zhk-guard',
    sourceType: 'development',
    status: 'published' as const,
    denormalizedFields: {
      name: 'ЖК Страж',
      location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 1' },
      classType: 'business',
      startDate: '2026-01-01',
      completionDate: '2027-01-01',
      description: 'Описание',
      // Внутреннее поле в проекции: если карточка его вернёт, страж это увидит
      // как поле вне контракта — тем же механизмом, что и любое другое.
      organizationId: new Types.ObjectId().toString(),
    },
    searchProjection: { geo: { type: 'Point', coordinates: [41.64, 41.62] } },
    seo: {
      title: 'ЖК Страж',
      description: 'Описание',
      canonicalUrl: '/developments/zhk-guard',
      structuredData: {},
    },
  };
}

function listingPublication() {
  return {
    _id: new Types.ObjectId(),
    slug: 'listing-guard',
    sourceType: 'listing',
    status: 'published' as const,
    denormalizedFields: {
      dealType: 'sale',
      price: { amountMinorUnits: 12000000, currency: 'GEL' },
      propertyType: 'apartment',
      commercialSubtype: null,
      location: { country: 'Georgia', city: 'Batumi', address: 'ул. Тестовая, 2' },
      characteristics: { area: 62.5, rooms: 2, floor: 4, totalFloors: 12 },
      media: [{ url: 'https://cdn.example/1.jpg', role: 'cover', sortOrder: 0, alt: 'фото' }],
      organizationId: new Types.ObjectId().toString(),
    },
    searchProjection: { geo: { type: 'Point', coordinates: [41.64, 41.62] } },
    seo: {
      title: 'Квартира',
      description: 'Описание',
      canonicalUrl: '/listings/listing-guard',
      structuredData: {},
    },
  };
}

function repositoryReturning(items: unknown[], one: unknown): MarketplacePublicationRepository {
  const page = { items, total: items.length };
  return {
    // Каталог ЖК и каталог листингов читают страницу разными методами
    // репозитория — мок отвечает на оба, чтобы страж не зависел от того,
    // какой из них выбран сегодня.
    listPublishedPage: jest.fn().mockResolvedValue(page),
    listPublishedByFilterPage: jest.fn().mockResolvedValue(page),
    findBySlug: jest.fn().mockResolvedValue(one),
  } as unknown as MarketplacePublicationRepository;
}

/** Поля, которые карточка действительно отдала: `undefined` значением не считается. */
function producedFields(card: Record<string, unknown>): string[] {
  return Object.entries(card)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
}

describe('Публичная карточка против контракта', () => {
  describe('PublicDevelopmentCard', () => {
    let card: Record<string, unknown>;

    beforeAll(async () => {
      const publication = developmentPublication();
      const controller = new PublicController(repositoryReturning([publication], publication), emptyOrganizationsService());
      card = (await controller.getPublicDevelopment('zhk-guard')) as Record<string, unknown>;
    });

    it('не отдаёт ни одного поля, которого нет в контракте', () => {
      const declared = new Set(schemaProperties('PublicDevelopmentCard'));
      expect(producedFields(card).filter((field) => !declared.has(field))).toEqual([]);
    });

    it('отдаёт всё, что контракт обещает, кроме явно зафиксированных исключений', () => {
      const produced = new Set(producedFields(card));
      const missing = schemaProperties('PublicDevelopmentCard')
        .filter((field) => !produced.has(field))
        .filter((field) => !(`PublicDevelopmentCard.${field}` in DECLARED_BUT_NOT_PRODUCED));

      expect(missing).toEqual([]);
    });

    it('список полей внутри location совпадает с PublicLocation', () => {
      const declared = new Set(schemaProperties('PublicLocation'));
      const location = card.location as Record<string, unknown>;
      expect(producedFields(location).filter((field) => !declared.has(field))).toEqual([]);
    });
  });

  describe('PublicListingCard', () => {
    let card: Record<string, unknown>;

    beforeAll(async () => {
      const publication = listingPublication();
      const controller = new PublicListingsController(repositoryReturning([publication], publication), emptyOrganizationsService());
      card = (await controller.getPublicListing('listing-guard')) as Record<string, unknown>;
    });

    it('не отдаёт ни одного поля, которого нет в контракте', () => {
      const declared = new Set(schemaProperties('PublicListingCard'));
      expect(producedFields(card).filter((field) => !declared.has(field))).toEqual([]);
    });

    it('отдаёт всё, что контракт обещает, кроме явно зафиксированных исключений', () => {
      const produced = new Set(producedFields(card));
      const missing = schemaProperties('PublicListingCard')
        .filter((field) => !produced.has(field))
        .filter((field) => !(`PublicListingCard.${field}` in DECLARED_BUT_NOT_PRODUCED));

      expect(missing).toEqual([]);
    });
  });

  describe('список и карточка описывают одно и то же', () => {
    it('элемент списка ЖК не богаче карточки ЖК', async () => {
      const publication = developmentPublication();
      const controller = new PublicController(repositoryReturning([publication], publication), emptyOrganizationsService());
      const page = (await controller.searchPublicDevelopments(
        new SearchPublicDevelopmentsQueryDto(),
      )) as { items: Record<string, unknown>[] };

      const declared = new Set(schemaProperties('PublicDevelopmentCard'));
      expect(producedFields(page.items[0]!).filter((field) => !declared.has(field))).toEqual([]);
    });

    it('элемент списка листингов не богаче карточки листинга', async () => {
      const publication = listingPublication();
      const controller = new PublicListingsController(repositoryReturning([publication], publication), emptyOrganizationsService());
      const page = (await controller.searchPublicListings(
        new SearchPublicListingsQueryDto(),
      )) as { items: Record<string, unknown>[] };

      const declared = new Set(schemaProperties('PublicListingCard'));
      expect(producedFields(page.items[0]!).filter((field) => !declared.has(field))).toEqual([]);
    });
  });
});
