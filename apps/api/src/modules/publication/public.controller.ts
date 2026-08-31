import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { MarketplacePublicationRepository } from '@baza/publication';
import { SearchPublicDevelopmentsQueryDto } from './dto/search-public-developments-query.dto';
import { parseBboxOrThrow } from './dto/parse-bbox';
import { toPublicGeoPoint } from './public-geo';
import {
  decodePublicCatalogCursor,
  encodePublicCatalogCursor,
  getPublicCatalogCursorValue,
} from './public-catalog-cursor';

/**
 * D-04/OpenAPI v1-first-vertical-slice.yaml: публичные marketplace
 * endpoints — БЕЗ TenantGuard/PermissionGuard (@Controller() без
 * @UseGuards намеренно, ADR-002 требование: публичные endpoint'ы не
 * tenant-scoped). Читает ИСКЛЮЧИТЕЛЬНО MarketplacePublication —
 * никогда напрямую canonical-коллекции (Development/Unit) — ADR-005:
 * "публикация не читается напрямую из canonical-сущностей на каждый
 * HTTP-запрос".
 *
 * Реальный SSR/metadata/schema.org рендеринг — задача marketplace-web
 * приложения (D-04, не начато в этой сессии), этот controller отдаёт
 * только JSON API, который такое приложение будет потреблять.
 */
@Controller('public/developments')
export class PublicController {
  constructor(private readonly publicationRepository: MarketplacePublicationRepository) {}

  @Get()
  async searchPublicDevelopments(@Query() query: SearchPublicDevelopmentsQueryDto) {
    // bbox уже провалидирован ValidationPipe (IsBboxConstraint) на входе в
    // метод — parseBboxOrThrow безопасно вызывать без повторной проверки.
    const bbox = query.bbox ? parseBboxOrThrow(query.bbox) : undefined;

    const sort = query.sort ?? 'newest';
    const cursor = query.cursor ? decodePublicCatalogCursor(query.cursor, sort) : undefined;
    const page = await this.publicationRepository.listPublishedPage({
      cursor,
      limit: query.limit + 1,
      city: query.city,
      bbox,
      sort,
    });
    const hasMore = page.items.length > query.limit;
    const pageItems = hasMore ? page.items.slice(0, query.limit) : page.items;
    const last = pageItems[pageItems.length - 1];
    const nextCursor = hasMore && last
      ? sort === 'newest'
        ? last._id.toString()
        : encodePublicCatalogCursor({
            sort,
            id: last._id,
            value: getPublicCatalogCursorValue(last, sort),
          })
      : null;

    return {
      items: pageItems.map(toPublicCard),
      nextCursor,
      total: page.total,
    };
  }

  @Get(':slug')
  async getPublicDevelopment(@Param('slug') slug: string) {
    const publication = await this.publicationRepository.findBySlug(slug);
    // Mirrors PublicListingsController.getPublicListing: a slug that
    // resolves but belongs to a different sourceType (e.g. a listing's slug
    // requested here) must 404 the same way an unknown slug does, not fall
    // through toPublicCard and render a mostly-empty development card.
    if (!publication || publication.sourceType !== 'development') {
      throw new NotFoundException('Publication not found');
    }
    return toPublicCard(publication);
  }
}

interface PublicLocation {
  country?: unknown;
  city?: unknown;
  address?: unknown;
}

interface PublicDevelopmentSeo {
  title?: unknown;
  description?: unknown;
  canonicalUrl?: unknown;
  structuredData?: unknown;
}

/**
 * Mirrors PublicListingsController's toPublicSeo — same whitelist boundary,
 * applied here too. Previously this file passed `publication.seo` through
 * unpicked, meaning the worker's `seo` object was the ONLY line of defense
 * for that one field, unlike every other field on this response (which the
 * comment above toPublicCard explicitly calls out as an independent,
 * second boundary). No live leak today (the worker only ever constructs a
 * clean seo object), but this closes the one field where that guarantee
 * didn't actually hold.
 */
function toPublicSeo(seo: PublicDevelopmentSeo | undefined) {
  if (!seo) return undefined;
  return {
    title: seo.title,
    description: seo.description,
    canonicalUrl: seo.canonicalUrl,
    structuredData: seo.structuredData,
  };
}

/**
 * Public API — ОТДЕЛЬНАЯ граница безопасности от worker'а, не просто
 * развёртка уже собранного worker'ом denormalizedFields. Раньше здесь стоял
 * `...publication.denormalizedFields` — это доверяло worker'у как
 * единственной линии защиты: если бы worker когда-либо по ошибке положил
 * туда internal-поле (organizationId, sourceId, version, contact,
 * internalNotes — что угодно), HTTP-эндпоинт немедленно отдал бы его любому
 * анонимному запросу, ничего в этом файле не заметило бы утечку. Явный
 * whitelist здесь — второй, независимый рубеж (defense-in-depth): даже если
 * worker-side mapper (development-publication.mapper.ts) когда-нибудь
 * сломается, эта функция физически не может пропустить поле, которого нет в
 * её собственном перечислении ниже.
 *
 * Список denormalizedFields — ровно то, что сейчас кладёт worker
 * (mapDevelopmentToDenormalizedFields): name/location/classType/startDate/
 * completionDate/description. Координаты — отдельное явное исключение из
 * searchProjection.geo, прошедшее собственную валидацию GeoJSON. Расширение
 * публичного набора требует явной правки обеих границ, не может произойти
 * случайно через spread.
 */
function toPublicCard(publication: {
  slug?: string;
  denormalizedFields: Record<string, unknown>;
  searchProjection?: Record<string, unknown>;
  seo?: { title: string; description: string; canonicalUrl: string; structuredData: Record<string, unknown> };
}) {
  const fields = publication.denormalizedFields;
  const location = fields.location as PublicLocation | undefined;
  const geo = toPublicGeoPoint(publication.searchProjection?.geo);
  const publicLocation = location || geo
    ? {
        country: location?.country,
        city: location?.city,
        address: location?.address,
        ...(geo ? { geo } : {}),
      }
    : undefined;

  return {
    slug: publication.slug,
    name: fields.name,
    location: publicLocation,
    classType: fields.classType,
    startDate: fields.startDate,
    completionDate: fields.completionDate,
    description: fields.description,
    seo: toPublicSeo(publication.seo),
  };
}
