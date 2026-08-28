import { buildPublicationScopeFilter } from './admin-publication-scope-filter';
import type { PublicationReadScope } from './admin-policy.service';

type PublicationSourceType = 'unit' | 'development' | 'listing';

describe('buildPublicationScopeFilter', () => {
  it("'all' (super_admin) → пустой фильтр, без ограничений", () => {
    expect(buildPublicationScopeFilter('all')).toEqual({});
  });

  it('один sourceType с global:true → {sourceType} без city-ограничения', () => {
    const scope = new Map<PublicationSourceType, PublicationReadScope>([['unit', { global: true, cities: [] }]]);
    expect(buildPublicationScopeFilter(scope)).toEqual({ sourceType: 'unit' });
  });

  it('один sourceType с несколькими city-grants → один clause с $in, не $or', () => {
    const scope = new Map<PublicationSourceType, PublicationReadScope>([
      ['development', { global: false, cities: ['batumi', 'tbilisi'] }],
    ]);
    expect(buildPublicationScopeFilter(scope)).toEqual({
      sourceType: 'development',
      'searchProjection.city': { $in: ['batumi', 'tbilisi'] },
    });
  });

  it('несколько sourceType → $or из соответствующих clauses', () => {
    const scope = new Map<PublicationSourceType, PublicationReadScope>([
      ['development', { global: false, cities: ['batumi'] }],
      ['unit', { global: true, cities: [] }],
    ]);
    expect(buildPublicationScopeFilter(scope)).toEqual({
      $or: [
        { sourceType: 'development', 'searchProjection.city': { $in: ['batumi'] } },
        { sourceType: 'unit' },
      ],
    });
  });

  it('пустой Map (ни одного readable sourceType) → null, не пустой $or', () => {
    expect(buildPublicationScopeFilter(new Map())).toBeNull();
  });
});
