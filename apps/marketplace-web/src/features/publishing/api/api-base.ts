/**
 * The Vite variable may be either a complete API origin or the repository's
 * usual `/api/v1` reverse-proxy path. Keep one canonical prefix so feature
 * clients never accidentally produce `/api/v1/api/v1/...` URLs.
 */
export function resolveApiBaseUrl(value?: string): string {
  const raw = (value ?? '').trim().replace(/\/+$/, '')
  if (!raw) return '/api/v1'
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}
