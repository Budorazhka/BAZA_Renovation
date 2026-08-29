import type { ListingDocument, PropertyAssetDocument } from '@baza/property-assets';
import type { PublicationSeo } from '@baza/publication';

export interface PublicMediaItem {
  url: string;
  role: 'cover' | 'gallery';
  sortOrder: number;
  alt?: string;
}

const DEAL_TYPE_LABEL: Record<ListingDocument['dealType'], string> = {
  sale: 'Продажа',
  rent_long: 'Аренда (долгосрочная)',
  rent_short: 'Аренда (посуточно)',
};

const PROPERTY_TYPE_LABEL: Record<PropertyAssetDocument['propertyType'], string> = {
  apartment: 'Квартира',
  house: 'Дом',
  land: 'Земельный участок',
  commercial: 'Коммерческая недвижимость',
};

/**
 * MKT-002 / MKT-004: explicit whitelist mapper — тот же принцип, что
 * development-publication.mapper.ts::mapDevelopmentToDenormalizedFields
 * ("поле физически не может утечь, если его нет в определении whitelist-
 * маппера"). Единственное место, решающее, что из Listing/PropertyAsset
 * становится публичным.
 */
export function mapListingToDenormalizedFields(
  listing: ListingDocument,
  asset: PropertyAssetDocument,
  media: PublicMediaItem[] = [],
): Record<string, unknown> {
  return {
    dealType: listing.dealType,
    price: {
      amountMinorUnits: listing.price.amountMinorUnits,
      currency: listing.price.currency,
    },
    propertyType: asset.propertyType,
    commercialSubtype: asset.commercialSubtype,
    location: {
      country: asset.location.country,
      city: asset.location.city,
      address: asset.location.address,
    },
    characteristics: {
      area: asset.characteristics.area,
      rooms: asset.characteristics.rooms,
      floor: asset.characteristics.floor,
      totalFloors: asset.characteristics.totalFloors,
    },
    media,
  };
}

export function buildListingSeo(listing: ListingDocument, asset: PropertyAssetDocument, slug: string): PublicationSeo {
  const dealLabel = DEAL_TYPE_LABEL[listing.dealType];
  const typeLabel = PROPERTY_TYPE_LABEL[asset.propertyType];
  const title = `${typeLabel} — ${dealLabel} — ${asset.location.city}`;
  const description = `${typeLabel}, ${asset.characteristics.area} м², ${asset.location.city}, ${asset.location.address}. ${dealLabel} на BAZA.sale.`;

  return {
    title,
    description,
    canonicalUrl: `/listings/${slug}`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'RealEstateListing',
      name: title,
      address: {
        '@type': 'PostalAddress',
        addressCountry: asset.location.country,
        addressLocality: asset.location.city,
        streetAddress: asset.location.address,
      },
    },
  };
}

export function buildListingSearchProjection(listing: ListingDocument, asset: PropertyAssetDocument): Record<string, unknown> {
  return {
    geo: asset.location.geo,
    city: asset.location.city,
    dealType: listing.dealType,
    propertyType: asset.propertyType,
    commercialSubtype: asset.commercialSubtype,
    priceAmountMinorUnits: listing.price.amountMinorUnits,
    priceCurrency: listing.price.currency,
  };
}
