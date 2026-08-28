import { computeDuplicateSignals, isExplicitDuplicateSignal, normalizeAddress, normalizePhone } from './dedupe.util';

function makeAsset(overrides: Partial<{ representativePhone: string; location: { city: string; address: string }; characteristics: { area: number; rooms?: number; floor?: number } }> = {}) {
  return {
    representativePhone: '+995 500 00 00 01',
    location: { country: 'GE', city: 'Batumi', address: '1 Rustaveli St' },
    characteristics: { area: 55, rooms: 2, floor: 5 },
    ...overrides,
  } as never;
}

describe('normalizePhone', () => {
  it('оставляет только цифры', () => {
    expect(normalizePhone('+995 500 00 00 01')).toBe('995500000001');
    expect(normalizePhone('995-500-00-00-01')).toBe('995500000001');
  });
});

describe('normalizeAddress', () => {
  it('приводит к нижнему регистру, схлопывает пробелы', () => {
    expect(normalizeAddress('  1  Rustaveli   St  ')).toBe('1 rustaveli st');
    expect(normalizeAddress('1 Rustaveli St')).toBe(normalizeAddress('1  RUSTAVELI  ST'));
  });
});

describe('computeDuplicateSignals', () => {
  it('phoneMatch true, если телефоны совпадают после нормализации (разный формат записи)', () => {
    const a = makeAsset({ representativePhone: '+995 500 00 00 01' });
    const b = makeAsset({ representativePhone: '995-500-00-00-01' });

    const signals = computeDuplicateSignals(a, b);

    expect(signals.phoneMatch).toBe(true);
  });

  it('phoneMatch false для разных телефонов', () => {
    const a = makeAsset({ representativePhone: '+995500000001' });
    const b = makeAsset({ representativePhone: '+995500000002' });

    expect(computeDuplicateSignals(a, b).phoneMatch).toBe(false);
  });

  it('addressMatch true при совпадении city+address после нормализации, false при разном городе', () => {
    const a = makeAsset({ location: { city: 'Batumi', address: '1 Rustaveli St' } });
    const sameAddressDifferentCity = makeAsset({ location: { city: 'Tbilisi', address: '1 Rustaveli St' } });
    const sameAddressSameCityDifferentCase = makeAsset({ location: { city: 'BATUMI', address: '1  RUSTAVELI  ST' } });

    expect(computeDuplicateSignals(a, sameAddressDifferentCity).addressMatch).toBe(false);
    expect(computeDuplicateSignals(a, sameAddressSameCityDifferentCase).addressMatch).toBe(true);
  });

  it('roomsAreaFloorMatch true только когда addressMatch true И area/rooms/floor совпадают', () => {
    const a = makeAsset({ characteristics: { area: 55, rooms: 2, floor: 5 } });
    const sameCharsDifferentAddress = makeAsset({
      location: { city: 'Batumi', address: '2 Different St' },
      characteristics: { area: 55, rooms: 2, floor: 5 },
    });
    const sameAddressDifferentArea = makeAsset({ characteristics: { area: 60, rooms: 2, floor: 5 } });
    const identical = makeAsset({ characteristics: { area: 55, rooms: 2, floor: 5 } });

    expect(computeDuplicateSignals(a, sameCharsDifferentAddress).roomsAreaFloorMatch).toBe(false);
    expect(computeDuplicateSignals(a, sameAddressDifferentArea).roomsAreaFloorMatch).toBe(false);
    expect(computeDuplicateSignals(a, identical).roomsAreaFloorMatch).toBe(true);
  });
});

describe('isExplicitDuplicateSignal', () => {
  it('true при phoneMatch, даже без addressMatch', () => {
    expect(isExplicitDuplicateSignal({ phoneMatch: true, addressMatch: false, roomsAreaFloorMatch: false })).toBe(true);
  });

  it('true при addressMatch И roomsAreaFloorMatch, без phoneMatch', () => {
    expect(isExplicitDuplicateSignal({ phoneMatch: false, addressMatch: true, roomsAreaFloorMatch: true })).toBe(true);
  });

  it('false при addressMatch без roomsAreaFloorMatch (тот же дом, разная квартира)', () => {
    expect(isExplicitDuplicateSignal({ phoneMatch: false, addressMatch: true, roomsAreaFloorMatch: false })).toBe(false);
  });

  it('false, если ни один сигнал не сработал', () => {
    expect(isExplicitDuplicateSignal({ phoneMatch: false, addressMatch: false, roomsAreaFloorMatch: false })).toBe(false);
  });
});
