import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { SearchPublicListingsQueryDto } from './dto/search-public-listings-query.dto';
import { parseBboxOrThrow } from './dto/parse-bbox';

/**
 * MKT-002: публичные marketplace endpoints для вторички/аренды — тот же
 * паттерн, что PublicController (public/developments, D-04A): без
 * TenantGuard/PermissionGuard (ADR-002: публичные endpoint'ы не
 * tenant-scoped), читает ИСКЛЮЧИТЕЛЬНО MarketplacePublication, никогда
 * canonical Listing/PropertyAsset напрямую (ADR-005).
 *
 * Отдельный контроллер, не метод на PublicController — разные query-DTO
 * (dealType/propertyType/commercialSubtype не имеют смысла для Development)
 * и разный whitelist (toPublicListingCard), тот же принцип раздельных
 * контроллеров, что уже применяется для admin publications vs public
 * developments (разные security-границы для разных source-типов).
 */
@Controller('public/listings')
export class PublicListingsController {
  constructor(private readonly publicationRepository: MarketplacePublicationRepository) {}

  @Get()
  async searchPublicListings(@Query() query: SearchPublicListingsQueryDto) {
    const bbox = query.bbox ? parseBboxOrThrow(query.bbox) : undefined;

    // limit+1 пагинация — тот же паттерн, что PublicController (D-04A):
    // обрезаем лишнюю запись, её _id становится nextCursor.
    const items = await this.publicationRepository.listPublishedByFilter({
      sourceType: 'listing',
      cursor: query.cursor ? new Types.ObjectId(query.cursor) : undefined,
      limit: query.limit + 1,
      city: query.city,
      bbox,
      dealType: query.dealType,
      propertyType: query.propertyType,
      commercialSubtype: query.commercialSubtype,
    });
    const hasMore = items.length > query.limit;
    const pageItems = hasMore ? items.slice(0, query.limit) : items;
    const nextCursor = hasMore ? pageItems[pageItems.length - 1]!._id.toString() : null;

    return {
      items: pageItems.map(toPublicListingCard),
      nextCursor,
    };
  }

  @Get(':slug')
  async getPublicListing(@Param('slug') slug: string) {
    const publication = await this.publicationRepository.findBySlug(slug);
    // findBySlug не фильтрует по sourceType (slug уникален глобально по
    // всей коллекции, ADR-005) — единый 404 для "не существует" И "slug
    // существует, но принадлежит Development/Unit, не Listing" (non-
    // disclosure паттерн, тот же принцип, что PublicController.getPublicDevelopment
    // не различает "никогда не публиковался"/"build_failed"/"unpublished").
    if (!publication || publication.sourceType !== 'listing') {
      throw new NotFoundException('Publication not found');
    }
    return toPublicListingCard(publication);
  }
}

interface PublicListingLocation {
  country?: unknown;
  city?: unknown;
  address?: unknown;
}

interface PublicListingPrice {
  amountMinorUnits?: unknown;
  currency?: unknown;
}

interface PublicListingCharacteristics {
  area?: unknown;
  rooms?: unknown;
  floor?: unknown;
  totalFloors?: unknown;
}

interface PublicListingSeo {
  title?: unknown;
  description?: unknown;
  canonicalUrl?: unknown;
  structuredData?: unknown;
}

/**
 * Тот же whitelist-принцип, что применяется к denormalizedFields ниже —
 * seo передавалось предыдущей версией этого файла целиком (`seo:
 * publication.seo`), полагаясь на то, что `PublicationSeo` — фиксированный
 * тип, которому доверяет worker-side mapper (listing-publication.mapper.ts).
 * Это ломает тот же defense-in-depth принцип, что уже применён к
 * denormalizedFields: если worker когда-либо положит в `seo` лишнее поле
 * (например по ошибке скопирует туда internal-объект вместо примитива),
 * контроллер отдал бы его как есть. Explicit enumeration здесь, тот же
 * рубеж, что toPublicListingCard уже применяет к остальным полям.
 */
function toPublicSeo(seo: PublicListingSeo | undefined) {
  if (!seo) return undefined;
  return {
    title: seo.title,
    description: seo.description,
    canonicalUrl: seo.canonicalUrl,
    structuredData: seo.structuredData,
  };
}

/**
 * Public API — ОТДЕЛЬНАЯ граница безопасности от worker'а, тот же принцип
 * defense-in-depth, что PublicController::toPublicCard (D-04A комментарий):
 * даже если worker-side mapper (listing-publication.mapper.ts) когда-нибудь
 * сломается и положит internal-поле в denormalizedFields, эта функция
 * физически не может его пропустить — explicit enumeration, не spread.
 *
 * Список полей — ровно то, что кладёт mapListingToDenormalizedFields:
 * dealType/price/propertyType/commercialSubtype/location/characteristics.
 * Расширение публичного набора требует явной правки ОБЕИХ границ (worker
 * mapper И этой функции).
 *
 * ЗАПРЕЩЕНО и физически отсутствует в denormalizedFields (см. mapper):
 * organizationId, publisherScope, identityId, internal version, contact/
 * private phone, duplicate signals, audit, commission, internal notes,
 * admin scopes, source internals — ни одно из этих полей не enumerated
 * здесь, поэтому не может попасть в ответ, даже если бы каким-то образом
 * оказалось в denormalizedFields.
 */
function toPublicListingCard(publication: {
  slug?: string;
  denormalizedFields: Record<string, unknown>;
  seo?: { title: string; description: string; canonicalUrl: string; structuredData: Record<string, unknown> };
}) {
  const fields = publication.denormalizedFields;
  const location = fields.location as PublicListingLocation | undefined;
  const price = fields.price as PublicListingPrice | undefined;
  const characteristics = fields.characteristics as PublicListingCharacteristics | undefined;

  return {
    slug: publication.slug,
    dealType: fields.dealType,
    price: price ? { amountMinorUnits: price.amountMinorUnits, currency: price.currency } : undefined,
    propertyType: fields.propertyType,
    commercialSubtype: fields.commercialSubtype,
    location: location ? { country: location.country, city: location.city, address: location.address } : undefined,
    characteristics: characteristics
      ? {
          area: characteristics.area,
          rooms: characteristics.rooms,
          floor: characteristics.floor,
          totalFloors: characteristics.totalFloors,
        }
      : undefined,
    // media: намеренно отсутствует — задача явно требует "если media
    // projection ещё не готова, возвращать только уже существующие public
    // media variants... не выдумывать URL" — поле не существует на схеме
    // Listing/PropertyAsset в этом проходе (см. mapper), поэтому его нет и
    // здесь; не placeholder-массив, просто отсутствующее поле.
    seo: toPublicSeo(publication.seo),
  };
}
