import { computeActualityState, getActualityThresholds, resolveActualityCategory } from './actuality.util';

describe('resolveActualityCategory', () => {
  it('rent_long/rent_short → rent независимо от propertyType', () => {
    expect(resolveActualityCategory('rent_long', 'apartment')).toBe('rent');
    expect(resolveActualityCategory('rent_short', 'commercial')).toBe('rent');
    expect(resolveActualityCategory('rent_long', 'house')).toBe('rent');
  });

  it('sale + apartment/house/land → secondary', () => {
    expect(resolveActualityCategory('sale', 'apartment')).toBe('secondary');
    expect(resolveActualityCategory('sale', 'house')).toBe('secondary');
    expect(resolveActualityCategory('sale', 'land')).toBe('secondary');
  });

  it('sale + commercial → other', () => {
    expect(resolveActualityCategory('sale', 'commercial')).toBe('other');
  });
});

describe('getActualityThresholds — точные числа из legacy-кода (owner decision, open-decisions.md разд.2)', () => {
  it('rent: 14/21', () => {
    expect(getActualityThresholds('rent')).toEqual({ warningDays: 14, overdueDays: 21 });
  });

  it('secondary: 28/60', () => {
    expect(getActualityThresholds('secondary')).toEqual({ warningDays: 28, overdueDays: 60 });
  });

  it('other: 10/15', () => {
    expect(getActualityThresholds('other')).toEqual({ warningDays: 10, overdueDays: 15 });
  });
});

describe('computeActualityState', () => {
  const now = new Date('2026-08-28T00:00:00Z');

  function daysAgo(days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  it('rent: up_to_date до 14 дней, needs_attention с 14, needs_update с 21', () => {
    expect(computeActualityState({ dealType: 'rent_long', propertyType: 'apartment', lastConfirmedAt: daysAgo(13), now })).toBe('up_to_date');
    expect(computeActualityState({ dealType: 'rent_long', propertyType: 'apartment', lastConfirmedAt: daysAgo(14), now })).toBe('needs_attention');
    expect(computeActualityState({ dealType: 'rent_long', propertyType: 'apartment', lastConfirmedAt: daysAgo(20), now })).toBe('needs_attention');
    expect(computeActualityState({ dealType: 'rent_long', propertyType: 'apartment', lastConfirmedAt: daysAgo(21), now })).toBe('needs_update');
  });

  it('secondary (sale+apartment): up_to_date до 28 дней, needs_attention с 28, needs_update с 60', () => {
    expect(computeActualityState({ dealType: 'sale', propertyType: 'apartment', lastConfirmedAt: daysAgo(27), now })).toBe('up_to_date');
    expect(computeActualityState({ dealType: 'sale', propertyType: 'apartment', lastConfirmedAt: daysAgo(28), now })).toBe('needs_attention');
    expect(computeActualityState({ dealType: 'sale', propertyType: 'apartment', lastConfirmedAt: daysAgo(59), now })).toBe('needs_attention');
    expect(computeActualityState({ dealType: 'sale', propertyType: 'apartment', lastConfirmedAt: daysAgo(60), now })).toBe('needs_update');
  });

  it('other (sale+commercial): up_to_date до 10 дней, needs_attention с 10, needs_update с 15', () => {
    expect(computeActualityState({ dealType: 'sale', propertyType: 'commercial', lastConfirmedAt: daysAgo(9), now })).toBe('up_to_date');
    expect(computeActualityState({ dealType: 'sale', propertyType: 'commercial', lastConfirmedAt: daysAgo(10), now })).toBe('needs_attention');
    expect(computeActualityState({ dealType: 'sale', propertyType: 'commercial', lastConfirmedAt: daysAgo(15), now })).toBe('needs_update');
  });

  it('только что подтверждённый (lastConfirmedAt === now) — up_to_date', () => {
    expect(computeActualityState({ dealType: 'sale', propertyType: 'apartment', lastConfirmedAt: now, now })).toBe('up_to_date');
  });
});
