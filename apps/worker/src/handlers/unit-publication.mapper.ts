import type {
  UnitDocument,
  BuildingDocument,
  DevelopmentDocument,
  FloorPlanDocument,
} from '@baza/development';
import type { PublicationSeo } from '@baza/publication';

/**
 * ADR-005: explicit whitelist mapper для Unit.
 * Перечисляет ровно те поля, которые должны попасть в публичную проекцию
 * юнита / квартиры новостройки. Внутренние заметки, комиссии, история изменений цен
 * физически не могут утечь.
 */
export function mapUnitToDenormalizedFields(
  unit: UnitDocument,
  building: BuildingDocument,
  development: DevelopmentDocument,
  floorPlan?: FloorPlanDocument | null,
  planImageUrl?: string,
): Record<string, unknown> {
  return {
    number: unit.number,
    kind: unit.kind,
    rooms: unit.rooms,
    area: unit.area,
    areaLiving: unit.areaLiving,
    areaBalcony: unit.areaBalcony,
    price: {
      amountMinorUnits: unit.price.amountMinorUnits,
      currency: unit.price.currency,
    },
    buildingName: building.name,
    developmentName: development.name,
    location: {
      country: development.location.country,
      city: development.location.city,
      address: development.location.address,
    },
    ...(floorPlan
      ? {
          floorPlan: {
            name: floorPlan.name,
            isEuro: floorPlan.isEuro,
            imageUrl: planImageUrl,
          },
        }
      : {}),
  };
}

export function buildUnitSeo(
  unit: UnitDocument,
  building: BuildingDocument,
  development: DevelopmentDocument,
  slug: string,
): PublicationSeo {
  const kindLabel = unit.kind === 'apartment' ? 'Квартира' : 'Помещение';
  const title = `${kindLabel} №${unit.number}, ${unit.area} м² — ${building.name}, ${development.name} — ${development.location.city}`;
  const description = `${kindLabel} №${unit.number} площадью ${unit.area} м² в ЖК ${development.name} (${building.name}), ${development.location.city}. Актуальная цена и планировка на BAZA.sale.`;

  return {
    title,
    description,
    canonicalUrl: `/units/${slug}`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'Apartment',
      name: title,
      description,
      address: {
        '@type': 'PostalAddress',
        addressCountry: development.location.country,
        addressLocality: development.location.city,
        streetAddress: development.location.address,
      },
    },
  };
}

export function buildUnitSearchProjection(
  unit: UnitDocument,
  building: BuildingDocument,
  development: DevelopmentDocument,
): Record<string, unknown> {
  return {
    geo: development.location.geo,
    city: development.location.city,
    priceAmountMinorUnits: unit.price.amountMinorUnits,
    priceCurrency: unit.price.currency,
    area: unit.area,
    rooms: unit.rooms,
    kind: unit.kind,
  };
}
