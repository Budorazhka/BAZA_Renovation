import { toPublicGeoPoint } from './public-geo';

describe('toPublicGeoPoint', () => {
  it('returns only a valid GeoJSON Point', () => {
    expect(toPublicGeoPoint({ type: 'Point', coordinates: [41.64, 41.62], secret: 'drop me' })).toEqual({
      type: 'Point',
      coordinates: [41.64, 41.62],
    });
  });

  it.each([
    undefined,
    null,
    { type: 'LineString', coordinates: [41.64, 41.62] },
    { type: 'Point', coordinates: [41.64] },
    { type: 'Point', coordinates: [181, 41.62] },
    { type: 'Point', coordinates: [41.64, Number.NaN] },
  ])('rejects malformed public geo: %p', (value) => {
    expect(toPublicGeoPoint(value)).toBeUndefined();
  });
});
