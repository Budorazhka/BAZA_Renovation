/**
 * Public geo whitelist.  MarketplacePublication.searchProjection is a
 * mixed read model, so the HTTP boundary must validate and copy only the
 * GeoJSON shape that the map is allowed to see.
 */
export interface PublicGeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export function toPublicGeoPoint(value: unknown): PublicGeoPoint | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'Point' || !Array.isArray(candidate.coordinates) || candidate.coordinates.length !== 2) {
    return undefined;
  }

  const [longitude, latitude] = candidate.coordinates;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return undefined;
  }

  return { type: 'Point', coordinates: [longitude, latitude] };
}
