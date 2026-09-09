import {
  mapDevelopmentToDenormalizedFields,
  buildDevelopmentSeo,
  buildSearchProjection,
  computeDevelopmentPriceFrom,
  computeDevelopmentPublicSummary,
} from './development-publication.mapper';

function makeDevelopment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Malibu Residence',
    location: {
      country: 'Georgia',
      city: 'Batumi',
      address: '1 Sea Boulevard',
      geo: { type: 'Point', coordinates: [41.65, 41.64] },
    },
    classType: 'business',
    startDate: new Date('2026-09-01'),
    completionDate: new Date('2027-06-01'),
    description: 'Premium residence on the seaside.',
    // Приватные поля, которые НЕ должны попасть в проекцию — прямая
    // проверка whitelist-принципа ADR-005.
    organizationId: 'secret-org-id',
    internalNotes: 'confidential negotiation notes',
    // D-03: contact реально существует на canonical-документе (D-05 модель
    // Development.contact.phone обязателен), но reveal-flow ещё не
    // спроектирован — mapper обязан его исключить, даже когда он присутствует.
    contact: { phone: '+995500000000', whatsapp: '+995500000001' },
    ...overrides,
  } as never;
}

describe('mapDevelopmentToDenormalizedFields — whitelist mapper (ADR-005)', () => {
  it('включает только явно вайтлистованные поля', () => {
    const result = mapDevelopmentToDenormalizedFields(makeDevelopment());

    expect(result).toEqual({
      name: 'Malibu Residence',
      location: { country: 'Georgia', city: 'Batumi', address: '1 Sea Boulevard' },
      classType: 'business',
      startDate: new Date('2026-09-01'),
      completionDate: new Date('2027-06-01'),
      description: 'Premium residence on the seaside.',
    });
  });

  it('НЕ включает organizationId (внутреннее поле, никогда не публичное)', () => {
    const result = mapDevelopmentToDenormalizedFields(makeDevelopment());
    expect(result).not.toHaveProperty('organizationId');
  });

  it('НЕ включает произвольные поля, добавленные на canonical-документе, если их нет в whitelist', () => {
    const result = mapDevelopmentToDenormalizedFields(makeDevelopment());
    expect(result).not.toHaveProperty('internalNotes');
  });

  it('НЕ включает location.geo (внутренняя структура для поиска, не для карточки)', () => {
    const result = mapDevelopmentToDenormalizedFields(makeDevelopment());
    const location = result.location as Record<string, unknown>;
    expect(location).not.toHaveProperty('geo');
  });

  /**
   * D-03: contact реально присутствует на исходном Development (fixture
   * его явно задаёт), но reveal-flow ещё не спроектирован — публикация
   * телефона без reveal-барьера была бы регрессом безопасности. Прямая
   * проверка, что whitelist-принцип это отсекает, а не просто "поля нет в
   * fixture, поэтому его нет в результате".
   */
  it('НЕ включает contact, даже когда он присутствует на исходном Development (reveal-flow не спроектирован)', () => {
    const result = mapDevelopmentToDenormalizedFields(makeDevelopment());
    expect(result).not.toHaveProperty('contact');
  });
});

describe('buildDevelopmentSeo', () => {
  it('строит title/description/canonicalUrl/structuredData', () => {
    const seo = buildDevelopmentSeo(makeDevelopment(), 'malibu-residence-batumi');

    expect(seo.title).toContain('Malibu Residence');
    expect(seo.title).toContain('Batumi');
    expect(seo.canonicalUrl).toBe('/developments/malibu-residence-batumi');
    expect(seo.structuredData['@type']).toBe('ApartmentComplex');
  });

  it('использует description с canonical-документа, если задан', () => {
    const seo = buildDevelopmentSeo(makeDevelopment({ description: 'Custom description' }), 'x');
    expect(seo.description).toBe('Custom description');
  });

  it('строит fallback description, если description отсутствует на canonical-документе', () => {
    const seo = buildDevelopmentSeo(makeDevelopment({ description: undefined }), 'x');
    expect(seo.description).toContain('Malibu Residence');
    expect(seo.description).toContain('Batumi');
  });

  it('обрезает слишком длинный description до 160 символов', () => {
    const longDescription = 'A'.repeat(300);
    const seo = buildDevelopmentSeo(makeDevelopment({ description: longDescription }), 'x');
    expect(seo.description.length).toBeLessThanOrEqual(160);
  });
});

describe('buildSearchProjection', () => {
  it('включает geo/city/classType для facet-фильтров и 2dsphere индекса', () => {
    const projection = buildSearchProjection(makeDevelopment());

    expect(projection).toEqual({
      geo: { type: 'Point', coordinates: [41.65, 41.64] },
      city: 'Batumi',
      classType: 'business',
    });
  });

  it('включает priceAmountMinorUnits и priceCurrency если priceFrom передан', () => {
    const projection = buildSearchProjection(makeDevelopment(), {
      amountMinorUnits: 5000000,
      currency: 'USD',
    });

    expect(projection).toMatchObject({
      priceAmountMinorUnits: 5000000,
      priceCurrency: 'USD',
    });
  });
});

describe('computeDevelopmentPriceFrom', () => {
  it('возвращает null при пустом наборе юнитов', () => {
    expect(computeDevelopmentPriceFrom([])).toBeNull();
  });

  it('возвращает цену единственного доступного юнита', () => {
    const units = [{ price: { amountMinorUnits: 4500000, currency: 'USD' } }];
    expect(computeDevelopmentPriceFrom(units)).toEqual({
      amountMinorUnits: 4500000,
      currency: 'USD',
    });
  });

  it('возвращает минимальную цену для нескольких юнитов в одной валюте', () => {
    const units = [
      { price: { amountMinorUnits: 6000000, currency: 'USD' } },
      { price: { amountMinorUnits: 4500000, currency: 'USD' } },
      { price: { amountMinorUnits: 8000000, currency: 'USD' } },
    ];
    expect(computeDevelopmentPriceFrom(units)).toEqual({
      amountMinorUnits: 4500000,
      currency: 'USD',
    });
  });

  it('возвращает null при смешанных валютах (безопасное правило без конвертации)', () => {
    const units = [
      { price: { amountMinorUnits: 1000000, currency: 'USD' } },
      { price: { amountMinorUnits: 5000000, currency: 'GEL' } },
    ];
    expect(computeDevelopmentPriceFrom(units)).toBeNull();
  });

  it('корректно вычисляет priceFrom при смене валюты всех юнитов', () => {
    const unitsGel = [
      { price: { amountMinorUnits: 12000000, currency: 'GEL' } },
      { price: { amountMinorUnits: 9500000, currency: 'GEL' } },
    ];
    expect(computeDevelopmentPriceFrom(unitsGel)).toEqual({
      amountMinorUnits: 9500000,
      currency: 'GEL',
    });
  });
});

describe('computeDevelopmentPublicSummary', () => {
  const buildings = [{ _id: 'b1', name: 'Building Alpha' }];

  it('при однородной валюте строит согласованные priceFrom, searchProjection и denormalizedFields', () => {
    const availableUnits = [
      {
        _id: 'u1',
        number: '101',
        kind: 'apartment',
        rooms: 2,
        area: 60,
        buildingId: 'b1',
        price: { amountMinorUnits: 5000000, currency: 'USD' },
      },
    ];

    const summary = computeDevelopmentPublicSummary({
      development: makeDevelopment(),
      buildings,
      availableUnits,
    });

    expect(summary.priceFrom).toEqual({ amountMinorUnits: 5000000, currency: 'USD' });
    expect(summary.denormalizedFields.priceFrom).toEqual({ amountMinorUnits: 5000000, currency: 'USD' });
    expect(summary.searchProjection.priceAmountMinorUnits).toBe(5000000);
    expect(summary.searchProjection.priceCurrency).toBe('USD');
    expect(summary.publicUnits).toHaveLength(1);
    expect(summary.publicUnits[0]?.buildingName).toBe('Building Alpha');
  });

  it('при смешанных валютах не публикует общий priceFrom, но сохраняет валюты отдельных квартир', () => {
    const availableUnits = [
      {
        _id: 'u1',
        number: '101',
        kind: 'apartment',
        area: 50,
        buildingId: 'b1',
        price: { amountMinorUnits: 5000000, currency: 'USD' },
      },
      {
        _id: 'u2',
        number: '102',
        kind: 'apartment',
        area: 75,
        buildingId: 'b1',
        price: { amountMinorUnits: 12000000, currency: 'GEL' },
      },
    ];

    const summary = computeDevelopmentPublicSummary({
      development: makeDevelopment(),
      buildings,
      availableUnits,
    });

    expect(summary.priceFrom).toBeNull();
    expect(summary.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(summary.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(summary.searchProjection).not.toHaveProperty('priceCurrency');
    expect(summary.publicUnits).toEqual([
      expect.objectContaining({ id: 'u1', price: { amountMinorUnits: 5000000, currency: 'USD' } }),
      expect.objectContaining({ id: 'u2', price: { amountMinorUnits: 12000000, currency: 'GEL' } }),
    ]);
  });

  it('при пустом наборе юнитов не оставляет залипших цен', () => {
    const summary = computeDevelopmentPublicSummary({
      development: makeDevelopment(),
      buildings,
      availableUnits: [],
    });

    expect(summary.priceFrom).toBeNull();
    expect(summary.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(summary.denormalizedFields).not.toHaveProperty('units');
    expect(summary.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(summary.searchProjection).not.toHaveProperty('priceCurrency');
    expect(summary.publicUnits).toEqual([]);
  });
});
