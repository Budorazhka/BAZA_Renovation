import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { MarketplacePublicationRepository } from '@baza/publication';
import { SearchPublicListingsQueryDto } from './dto/search-public-listings-query.dto';
import { parseBboxOrThrow } from './dto/parse-bbox';
import { toPublicGeoPoint } from './public-geo';

@Controller('public/listings')
export class PublicListingsController {
  constructor(private readonly publicationRepository: MarketplacePublicationRepository) {}

  @Get()
  async searchPublicListings(@Query() query: SearchPublicListingsQueryDto) {
    const bbox = query.bbox ? parseBboxOrThrow(query.bbox) : undefined;

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

function toPublicSeo(seo: PublicListingSeo | undefined) {
  if (!seo) return undefined;
  return {
    title: seo.title,
    description: seo.description,
    canonicalUrl: seo.canonicalUrl,
    structuredData: seo.structuredData,
  };
}

function toPublicListingCard(publication: {
  slug?: string;
  denormalizedFields: Record<string, unknown>;
  searchProjection?: Record<string, unknown>;
  seo?: { title: string; description: string; canonicalUrl: string; structuredData: Record<string, unknown> };
}) {
  const fields = publication.denormalizedFields;
  const location = fields.location as PublicListingLocation | undefined;
  const geo = toPublicGeoPoint(publication.searchProjection?.geo);
  const price = fields.price as PublicListingPrice | undefined;
  const characteristics = fields.characteristics as PublicListingCharacteristics | undefined;
  const rawMedia = Array.isArray(fields.media) ? (fields.media as Array<Record<string, unknown>>) : [];

  const media = rawMedia
    .map((item) => {
      const url = typeof item.url === 'string' ? item.url : undefined;
      const role = item.role === 'cover' ? ('cover' as const) : ('gallery' as const);
      const sortOrder = typeof item.sortOrder === 'number' ? item.sortOrder : 0;
      const alt = typeof item.alt === 'string' ? item.alt : undefined;
      if (!url) return null;
      return { url, role, sortOrder, alt };
    })
    .filter((item): item is { url: string; role: 'cover' | 'gallery'; sortOrder: number; alt: string | undefined } => item !== null);

  return {
    slug: publication.slug,
    dealType: fields.dealType,
    price: price ? { amountMinorUnits: price.amountMinorUnits, currency: price.currency } : undefined,
    propertyType: fields.propertyType,
    commercialSubtype: fields.commercialSubtype,
    location:
      location || geo
        ? {
            country: location?.country,
            city: location?.city,
            address: location?.address,
            ...(geo ? { geo } : {}),
          }
        : undefined,
    characteristics: characteristics
      ? {
          area: characteristics.area,
          rooms: characteristics.rooms,
          floor: characteristics.floor,
          totalFloors: characteristics.totalFloors,
        }
      : undefined,
    media,
    seo: toPublicSeo(publication.seo),
  };
}
