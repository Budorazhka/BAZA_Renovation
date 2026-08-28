import type { DevelopmentDocument } from '@baza/development';
import type { PublicationSeo } from '@baza/publication';

/**
 * ADR-005: explicit whitelist mapper — "перечисляет ровно те поля, которые
 * должны попасть в публичную проекцию... поле физически не может утечь,
 * если его нет в определении whitelist-маппера". Это ЕДИНСТВЕННОЕ место,
 * решающее, что из Development становится публичным — расширение списка
 * публичных полей требует явной правки этой функции, не может произойти
 * случайно через spread/copy всего документа.
 *
 * priceFrom (OpenAPI PublicDevelopmentCard.priceFrom) НЕ включено в этот
 * проход — требует агрегации минимальной цены по Unit-коллекции модуля
 * developments (apps/api), к которой worker пока не имеет доступа
 * (мигрирован в @baza/development только Development, не вся иерархия
 * Building/Floor/Unit — осознанное сужение scope). Явно зафиксировано как
 * отсутствующее поле, не молча опущено.
 *
 * contact (D-03) НАМЕРЕННО НЕ включён — явного reveal-flow механизма (кто,
 * когда, при каком действии покупателя получает контакт застройщика) в
 * проекте пока нет. Публикация телефона напрямую в открытую проекцию,
 * доступную ЛЮБОМУ анонимному посетителю без reveal-барьера, была бы
 * регрессом безопасности, а не соответствием формулировке "contact только
 * согласно принятому reveal-flow" — единственный способ соответствовать ей
 * буквально сейчас — не публиковать. Добавление contact сюда — отдельная
 * задача, требующая сначала спроектировать сам reveal-механизм.
 */
export function mapDevelopmentToDenormalizedFields(development: DevelopmentDocument): Record<string, unknown> {
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
    // priceFrom: намеренно отсутствует, см. комментарий функции выше.
    // contact: намеренно НЕ включён, см. комментарий функции выше.
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

export function buildSearchProjection(development: DevelopmentDocument): Record<string, unknown> {
  return {
    geo: development.location.geo,
    city: development.location.city,
    classType: development.classType,
  };
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
