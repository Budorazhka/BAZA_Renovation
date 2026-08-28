import type { ListingDocument, PropertyAssetDocument } from '@baza/property-assets';
import type { PublicationSeo } from '@baza/publication';

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
 * MKT-002: explicit whitelist mapper — тот же принцип, что
 * development-publication.mapper.ts::mapDevelopmentToDenormalizedFields
 * ("поле физически не может утечь, если его нет в определении whitelist-
 * маппера"). Единственное место, решающее, что из Listing/PropertyAsset
 * становится публичным.
 *
 * ЗАПРЕЩЕНО (явно, не молча опущено) — organizationId/publisherScope:
 * tenant-поле, никогда не публикуется (ADR-002). ОБНОВЛЕНО (owner/realtor
 * marketplace publishing wizard, независимый review): publisherScope
 * ТЕПЕРЬ реально может нести identityId (`{type:'marketplace_account',
 * identityId}` ветка @baza/tenant-scope::OwnerScope, наравне с
 * `{type:'organization', organizationId}`) — предыдущая версия этого
 * комментария ошибочно утверждала "Listing/PropertyAsset принадлежат
 * organization, не identity — нет поля для утечки", что было верно только
 * до этой задачи. Сам publisherScope физически не перечислен в возвращаемом
 * объекте ниже (explicit whitelist, не spread) — ни organizationId, ни
 * identityId не могут утечь ни в одной из веток union'а. representativePhone
 * (DEDUPE-001) — реально существует на схеме PropertyAsset, но НЕ включён в
 * whitelist ниже: контакт представителя не публикуется без отдельного
 * reveal-механизма, та же логика, что уже применялась к Development.contact
 * (публикация телефона без reveal-барьера — регресс безопасности). internal
 * version: используется только для CAS/optimistic concurrency внутри
 * API-процесса, не публичный инвариант; duplicate signals (DuplicateCandidate)
 * — отдельная коллекция, никогда не поле Listing/PropertyAsset, поэтому
 * физически не может утечь через ЭТОТ mapper; audit: отдельная append-only
 * коллекция, никогда не проекция; commission/internal notes: не существуют
 * на схеме; admin scopes: AdminContext-специфичное, не относится к
 * canonical-сущности.
 */
export function mapListingToDenormalizedFields(
  listing: ListingDocument,
  asset: PropertyAssetDocument,
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
    // media: намеренно отсутствует — PropertyAsset/Listing схема не
    // содержит media-поля в этом проходе (PROP-001 не включал media).
    // Публичный ответ отдаёт только уже существующие public media variants,
    // если/когда поле появится — не выдумывает URL сейчас (MKT-002 ТЗ).
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
