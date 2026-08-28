import { Types } from 'mongoose';
import { mapListingToDenormalizedFields, buildListingSeo, buildListingSearchProjection } from './listing-publication.mapper';

function makeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    dealType: 'sale',
    price: { amountMinorUnits: 15_000_000, currency: 'USD' },
    // Приватные поля, которые НЕ должны попасть в проекцию — прямая
    // проверка whitelist-принципа ADR-005 (тот же паттерн, что
    // development-publication.mapper.spec.ts).
    publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
    version: 4,
    propertyAssetId: new Types.ObjectId(),
    internalNotes: 'confidential negotiation notes',
    ...overrides,
  } as never;
}

function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    propertyType: 'apartment',
    commercialSubtype: undefined,
    location: {
      country: 'Georgia',
      city: 'Batumi',
      address: '1 Sea Boulevard',
      geo: { type: 'Point', coordinates: [41.65, 41.64] },
    },
    characteristics: { area: 55, rooms: 2, floor: 5, totalFloors: 12 },
    publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
    version: 1,
    ...overrides,
  } as never;
}

describe('mapListingToDenormalizedFields — whitelist mapper (MKT-002/ADR-005)', () => {
  it('включает только явно вайтлистованные поля', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());

    expect(result).toEqual({
      dealType: 'sale',
      price: { amountMinorUnits: 15_000_000, currency: 'USD' },
      propertyType: 'apartment',
      commercialSubtype: undefined,
      location: { country: 'Georgia', city: 'Batumi', address: '1 Sea Boulevard' },
      characteristics: { area: 55, rooms: 2, floor: 5, totalFloors: 12 },
    });
  });

  it('НЕ включает publisherScope/organizationId ни с Listing, ни с PropertyAsset', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());
    expect(result).not.toHaveProperty('publisherScope');
    expect(result).not.toHaveProperty('organizationId');
  });

  it('НЕ включает internal version ни с Listing, ни с PropertyAsset', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());
    expect(result).not.toHaveProperty('version');
  });

  it('НЕ включает произвольные поля, добавленные на canonical-документе, если их нет в whitelist', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());
    expect(result).not.toHaveProperty('internalNotes');
  });

  it('НЕ включает propertyAssetId (внутренняя связь, не публичное поле)', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());
    expect(result).not.toHaveProperty('propertyAssetId');
  });

  it('НЕ включает location.geo (внутренняя структура для поиска, не для карточки)', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset());
    const location = result.location as Record<string, unknown>;
    expect(location).not.toHaveProperty('geo');
  });

  it('включает commercialSubtype, когда он задан на PropertyAsset', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset({ propertyType: 'commercial', commercialSubtype: 'office' }));
    expect(result.commercialSubtype).toBe('office');
  });

  /**
   * Owner/realtor marketplace publishing wizard (независимый review,
   * Gemini): OwnerScope теперь реально может нести identityId
   * (`{type:'marketplace_account', identityId}`), не только organizationId.
   * Прямая проверка, что whitelist одинаково защищает ОБЕ ветки union'а —
   * без этого теста регрессия могла бы остаться незамеченной, если бы
   * кто-то добавил identityId в whitelist по аналогии с organizationId.
   */
  it('НЕ включает publisherScope.identityId, если Listing/PropertyAsset принадлежат marketplace-аккаунту (не organization)', () => {
    const marketplaceScope = { type: 'marketplace_account', identityId: new Types.ObjectId() };
    const result = mapListingToDenormalizedFields(
      makeListing({ publisherScope: marketplaceScope }),
      makeAsset({ publisherScope: marketplaceScope }),
    );

    expect(result).not.toHaveProperty('publisherScope');
    expect(result).not.toHaveProperty('identityId');
    expect(JSON.stringify(result)).not.toContain(marketplaceScope.identityId.toString());
  });

  it('НЕ включает representativePhone (DEDUPE-001 dedupe-сигнал, не публичный контакт — reveal flow не спроектирован)', () => {
    const result = mapListingToDenormalizedFields(makeListing(), makeAsset({ representativePhone: '+995500000001' }));

    expect(result).not.toHaveProperty('representativePhone');
    expect(JSON.stringify(result)).not.toContain('+995500000001');
  });
});

describe('buildListingSeo', () => {
  it('строит title/description/canonicalUrl/structuredData для sale-listing', () => {
    const seo = buildListingSeo(makeListing({ dealType: 'sale' }), makeAsset(), 'apartment-sale-batumi');

    expect(seo.title).toContain('Продажа');
    expect(seo.title).toContain('Batumi');
    expect(seo.canonicalUrl).toBe('/listings/apartment-sale-batumi');
    expect(seo.structuredData['@type']).toBe('RealEstateListing');
  });

  it('различает sale/rent_long/rent_short в title', () => {
    const saleSeo = buildListingSeo(makeListing({ dealType: 'sale' }), makeAsset(), 'x');
    const rentLongSeo = buildListingSeo(makeListing({ dealType: 'rent_long' }), makeAsset(), 'x');
    const rentShortSeo = buildListingSeo(makeListing({ dealType: 'rent_short' }), makeAsset(), 'x');

    expect(saleSeo.title).not.toBe(rentLongSeo.title);
    expect(rentLongSeo.title).not.toBe(rentShortSeo.title);
  });
});

describe('buildListingSearchProjection', () => {
  it('включает geo/city/dealType/propertyType/commercialSubtype/price для facet-фильтров и 2dsphere индекса', () => {
    const projection = buildListingSearchProjection(
      makeListing({ dealType: 'rent_short', price: { amountMinorUnits: 5_000_00, currency: 'GEL' } }),
      makeAsset({ propertyType: 'commercial', commercialSubtype: 'retail' }),
    );

    expect(projection).toEqual({
      geo: { type: 'Point', coordinates: [41.65, 41.64] },
      city: 'Batumi',
      dealType: 'rent_short',
      propertyType: 'commercial',
      commercialSubtype: 'retail',
      priceAmountMinorUnits: 5_000_00,
      priceCurrency: 'GEL',
    });
  });
});
