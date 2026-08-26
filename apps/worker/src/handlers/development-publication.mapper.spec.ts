import { mapDevelopmentToDenormalizedFields, buildDevelopmentSeo, buildSearchProjection } from './development-publication.mapper';

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
    completionDate: new Date('2027-06-01'),
    description: 'Premium residence on the seaside.',
    // Приватные поля, которые НЕ должны попасть в проекцию — прямая
    // проверка whitelist-принципа ADR-005.
    organizationId: 'secret-org-id',
    internalNotes: 'confidential negotiation notes',
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
      completionDate: new Date('2027-06-01'),
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
});
