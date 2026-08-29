/** Fetch and router work can be cancelled by navigation or a changed query. */
export function isAbortError(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false
  const name = 'name' in cause ? (cause as { name?: unknown }).name : undefined
  return name === 'AbortError'
}
