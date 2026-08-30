/**
 * Resolves the build-time MapLibre style setting.
 *
 * The repository env templates intentionally contain a visible placeholder.
 * Treating that value as a real URL makes MapLibre emit a noisy network error;
 * returning undefined lets both map surfaces render their honest setup state.
 */
export function resolveMapStyleUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized || normalized.startsWith('REPLACE_ME_')) return undefined
  return normalized
}
