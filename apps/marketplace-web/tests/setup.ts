/** MapLibre creates its worker blob URL during module evaluation. jsdom has
 * URL but not the browser-only object URL helpers, so provide the smallest
 * test-only surface needed to import the real library. */
if (typeof window !== 'undefined') {
  window.URL.createObjectURL ??= () => 'blob:vitest-maplibre-worker'
  window.URL.revokeObjectURL ??= () => undefined
}
