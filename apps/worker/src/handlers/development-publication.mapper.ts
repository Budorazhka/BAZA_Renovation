import type { DevelopmentDocument } from '@baza/development';
import type { PublicationSeo } from '@baza/publication';

export interface PublicDevelopmentUnitSummary {
  id: string;
  number: string;
  kind: string;
  rooms?: number;
  area: number;
  floor?: number;
  buildingName?: string;
  price: {
    amountMinorUnits: number;
    currency: string;
  };
}

export interface DevelopmentPublicSummaryResult {
  priceFrom: { amountMinorUnits: number; currency: string } | null;
  publicUnits: PublicDevelopmentUnitSummary[];
  denormalizedFields: Record<string, unknown>;
  searchProjection: Record<string, unknown>;
}

/**
 * Вычисляет минимальную цену (priceFrom) для набора доступных юнитов ЖК.
 * Правило безопасной мультивалютности:
 * - Если юнитов нет -> null
 * - Если юниты имеют разные валюты -> null (не сравнивать USD/GEL/RUB как одну валюту)
 * - Если все юниты имеют одну валюту -> минимальная цена и эта валюта
 */
export function computeDevelopmentPriceFrom(
  units: Array<{ price: { amountMinorUnits: number; currency: string } }>,
): { amountMinorUnits: number; currency: string } | null {
  if (units.length === 0) return null;

  const currencies = new Set(units.map((u) => u.price.currency));
  if (currencies.size > 1) {
    return null;
  }

  const minUnit = units.reduce(
    (min, u) => (u.price.amountMinorUnits < min.price.amountMinorUnits ? u : min),
    units[0]!,
  );

  return {
    amountMinorUnits: minUnit.price.amountMinorUnits,
    currency: minUnit.price.currency,
  };
}

/**
 * Единый построитель сводки ЖК для Worker-обработчиков:
 * PublicationRequestedHandler, UnitPriceChangedHandler, UnitStatusChangedHandler.
 * Гарантирует синхронность и согласованность denormalizedFields и searchProjection.
 */
export function computeDevelopmentPublicSummary(params: {
  development: DevelopmentDocument;
  buildings: Array<{ _id: unknown; name: string }>;
  availableUnits: Array<{
    _id: unknown;
    number: string;
    kind: string;
    rooms?: number;
    area: number;
    floor?: number;
    buildingId: unknown;
    price: { amountMinorUnits: number; currency: string };
  }>;
}): DevelopmentPublicSummaryResult {
  const priceFrom = computeDevelopmentPriceFrom(params.availableUnits);

  const buildingMap = new Map(params.buildings.map((b) => [String(b._id), b.name]));
  const publicUnits: PublicDevelopmentUnitSummary[] = params.availableUnits.map((u) => ({
    id: String(u._id),
    number: u.number,
    kind: u.kind,
    rooms: u.rooms,
    area: u.area,
    floor: u.floor,
    buildingName: buildingMap.get(String(u.buildingId)),
    price: {
      amountMinorUnits: u.price.amountMinorUnits,
      currency: u.price.currency,
    },
  }));

  const denormalizedFields = mapDevelopmentToDenormalizedFields(
    params.development,
    priceFrom,
    publicUnits,
  );
  const searchProjection = buildSearchProjection(params.development, priceFrom);

  return {
    priceFrom,
    publicUnits,
    denormalizedFields,
    searchProjection,
  };
}

/**
 * ADR-005: explicit whitelist mapper — "перечисляет ровно те поля, которые
 * должны попасть в публичную проекцию... поле физически не может утечь,
 * если его нет в определении whitelist-маппера". Это ЕДИНСТВЕННОЕ место,
 * решающее, что из Development становится публичным.
 *
 * priceFrom (OpenAPI PublicDevelopmentCard.priceFrom) вычисляется по
 * доступным юнитам корпусов ЖК через UnitRepository.
 *
 * contact (D-03) НАМЕРЕННО НЕ включён — явного reveal-flow механизма (кто,
 * когда, при каком действии покупателя получает контакт застройщика) в
 * открытом доступе нет. Контакт раскрывается только через команду
 * /public/developments/{slug}/reveal-contact.
 */
export function mapDevelopmentToDenormalizedFields(
  development: DevelopmentDocument,
  priceFrom?: { amountMinorUnits: number; currency: string } | null,
  units?: PublicDevelopmentUnitSummary[],
): Record<string, unknown> {
  return {
    name: development.name,
    location: {
      country: development.location.country,
      city: development.location.city,
      address: development.location.address,
    },
    classType: development.classType,
    startDate: development.startDate,
    completionDate: development.completionDate,
    description: development.description,
    ...(priceFrom ? { priceFrom } : {}),
    ...(units && units.length > 0 ? { units } : {}),
  };
}

export function buildDevelopmentSeo(development: DevelopmentDocument, slug: string): PublicationSeo {
  const title = `${development.name} — ${development.location.city}`;
  const description = development.description
    ? truncate(development.description, 160)
    : `${development.name} в ${development.location.city}. Актуальные планировки и цены на BAZA.sale.`;

  return {
    title,
    description,
    canonicalUrl: `/developments/${slug}`,
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'ApartmentComplex',
      name: development.name,
      address: {
        '@type': 'PostalAddress',
        addressCountry: development.location.country,
        addressLocality: development.location.city,
        streetAddress: development.location.address,
      },
    },
  };
}

export function buildSearchProjection(
  development: DevelopmentDocument,
  priceFrom?: { amountMinorUnits: number; currency: string } | null,
): Record<string, unknown> {
  return {
    geo: development.location.geo,
    city: development.location.city,
    classType: development.classType,
    ...(priceFrom ? { priceAmountMinorUnits: priceFrom.amountMinorUnits, priceCurrency: priceFrom.currency } : {}),
  };
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
